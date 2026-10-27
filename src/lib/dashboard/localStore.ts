/**
 * IndexedDB persistence for the dashboard snapshots (docs/pwa-offline.md).
 *
 * The device keeps up to {@link MAX_SNAPSHOTS_PER_USER} recent *contexts* per
 * account, each keyed by the account id + the context's request key. A cold open
 * paints the newest one immediately; switching back to a previously loaded view
 * paints its cached context instantly and revalidates in the background. This is
 * a pure performance cache — never authoritative — and every read is guarded so
 * a missing / corrupt / unavailable IndexedDB degrades to "no cache" instead of
 * an error.
 *
 * All functions are safe to call on the server (they no-op) so the module can be
 * imported from shared code without a `typeof window` dance at every call site.
 */

import {
  DASHBOARD_SNAPSHOT_VERSION,
  SNAPSHOT_INDEX_VERSION,
  buildSnapshotIndexEntry,
  isSnapshotIndexUsable,
  isSnapshotRecordUsable,
  selectSnapshotsToEvict,
  snapshotIndexStorageKey,
  snapshotStorageKey,
  type DashboardSnapshotIndex,
  type DashboardSnapshotIndexEntry,
  type DashboardSnapshotRecord,
} from "./snapshot";

const DB_NAME = "cloudy2";
// v2: one record per context (composite key) instead of one per account. The
// upgrade drops the legacy single-record store, so a deploy can't read an
// old-shape entry (the next load revalidates).
const DB_VERSION = 2;
const STORE_NAME = "dashboardSnapshots";

function hasIndexedDb(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME);
      }
      db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function userRange(userId: string): IDBKeyRange {
  const prefix = `${userId}::`;
  return IDBKeyRange.bound(prefix, `${prefix}\uffff`);
}

function runRequest<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, mode);
          const request = operation(tx.objectStore(STORE_NAME));
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => resolve(null);
          tx.oncomplete = () => db.close();
          tx.onerror = () => resolve(null);
          tx.onabort = () => resolve(null);
        } catch {
          db.close();
          resolve(null);
        }
      }),
  );
}

/** Every usable stored record in the given account range (best-effort). */
function readAllRecords(
  userId?: string,
): Promise<{ key: string; record: DashboardSnapshotRecord }[]> {
  return openDb().then(
    (db) =>
      new Promise((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, "readonly");
          const store = tx.objectStore(STORE_NAME);
          const range = userId ? userRange(userId) : undefined;
          const keysRequest = store.getAllKeys(range);
          const valuesRequest = store.getAll(range);
          let keys: IDBValidKey[] = [];
          let values: unknown[] = [];
          let pending = 2;
          const settle = () => {
            if (--pending > 0) return;
            const out: { key: string; record: DashboardSnapshotRecord }[] = [];
            for (let i = 0; i < keys.length; i += 1) {
              const key = keys[i];
              const record = values[i];
              if (typeof key === "string" && isSnapshotRecordUsable(record)) {
                out.push({ key, record });
              }
            }
            resolve(out);
          };
          keysRequest.onsuccess = () => {
            keys = keysRequest.result;
            settle();
          };
          valuesRequest.onsuccess = () => {
            values = valuesRequest.result;
            settle();
          };
          const fail = () => resolve([]);
          keysRequest.onerror = fail;
          valuesRequest.onerror = fail;
          tx.oncomplete = () => db.close();
          tx.onerror = fail;
          tx.onabort = fail;
        } catch {
          db.close();
          resolve([]);
        }
      }),
  );
}

/** Every key in the account range (cheap: no value deserialization). */
function readAllKeys(userId: string): Promise<string[]> {
  return openDb().then(
    (db) =>
      new Promise((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, "readonly");
          const request = tx.objectStore(STORE_NAME).getAllKeys(userRange(userId));
          request.onsuccess = () => {
            resolve(request.result.filter((key): key is string => typeof key === "string"));
          };
          request.onerror = () => resolve([]);
          tx.oncomplete = () => db.close();
          tx.onerror = () => resolve([]);
          tx.onabort = () => resolve([]);
        } catch {
          db.close();
          resolve([]);
        }
      }),
  );
}

function runWrite(operation: (store: IDBObjectStore) => void): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, "readwrite");
          operation(tx.objectStore(STORE_NAME));
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            resolve();
          };
          tx.onabort = () => {
            db.close();
            resolve();
          };
        } catch {
          db.close();
          resolve();
        }
      }),
  );
}

function deleteKeys(keys: readonly string[]): Promise<void> {
  if (keys.length === 0) return Promise.resolve();
  return openDb().then(
    (db) =>
      new Promise<void>((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, "readwrite");
          const store = tx.objectStore(STORE_NAME);
          for (const key of keys) {
            store.delete(key);
          }
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            resolve();
          };
          tx.onabort = () => {
            db.close();
            resolve();
          };
        } catch {
          db.close();
          resolve();
        }
      }),
  );
}

/** The lightweight per-account index used to pick a cold paint without reading every snapshot. */
export async function readDashboardSnapshotIndex(
  userId: string,
): Promise<DashboardSnapshotIndex | null> {
  if (!hasIndexedDb()) return null;
  const raw = await runRequest<unknown>("readonly", (store) =>
    store.get(snapshotIndexStorageKey(userId)),
  );
  return isSnapshotIndexUsable(raw) ? raw : null;
}

/** One stored context, or null when absent/invalid. */
export async function readDashboardSnapshot(
  userId: string,
  requestKey: string,
): Promise<DashboardSnapshotRecord | null> {
  if (!hasIndexedDb()) return null;
  const raw = await runRequest<unknown>("readonly", (store) =>
    store.get(snapshotStorageKey(userId, requestKey)),
  );
  return isSnapshotRecordUsable(raw) ? raw : null;
}

/** Every cached context for this account (for the full warm-map hydration). */
export async function readDashboardSnapshots(userId: string): Promise<DashboardSnapshotRecord[]> {
  if (!hasIndexedDb()) return [];
  const all = await readAllRecords(userId);
  return all.map((entry) => entry.record);
}

async function indexFromRecords(userId: string): Promise<DashboardSnapshotIndex> {
  const all = await readAllRecords(userId);
  return {
    v: SNAPSHOT_INDEX_VERSION,
    entries: all.map((entry) => buildSnapshotIndexEntry(entry.record)),
  };
}

function mergeIndexEntries(
  current: readonly DashboardSnapshotIndexEntry[],
  next: readonly DashboardSnapshotIndexEntry[],
): DashboardSnapshotIndexEntry[] {
  const byKey = new Map(current.map((entry) => [entry.requestKey, entry]));
  for (const entry of next) {
    byKey.set(entry.requestKey, entry);
  }
  return [...byKey.values()];
}

async function writeIndex(userId: string, entries: DashboardSnapshotIndexEntry[]): Promise<void> {
  await runWrite((store) => {
    store.put(
      { v: SNAPSHOT_INDEX_VERSION, entries } satisfies DashboardSnapshotIndex,
      snapshotIndexStorageKey(userId),
    );
  });
}

/**
 * Persist several contexts in one transaction, then update the cold-paint index
 * and prune once. The tab preload writes every warm context at once; this also
 * avoids a full-store value scan for the old prune path.
 */
export async function writeDashboardSnapshots(
  userId: string,
  entries: readonly {
    data: DashboardSnapshotRecord["data"];
    context: DashboardSnapshotRecord["context"];
  }[],
): Promise<void> {
  if (!hasIndexedDb() || entries.length === 0) return;
  const savedAt = Date.now();
  const records = entries.map<DashboardSnapshotRecord>((entry) => ({
    version: DASHBOARD_SNAPSHOT_VERSION,
    savedAt,
    context: entry.context,
    data: entry.data,
  }));
  try {
    await runWrite((store) => {
      for (const record of records) {
        store.put(record, snapshotStorageKey(userId, record.context.requestKey));
      }
    });
    const current = (await readDashboardSnapshotIndex(userId)) ?? (await indexFromRecords(userId));
    const merged = mergeIndexEntries(current.entries, records.map(buildSnapshotIndexEntry));
    const evictKeys = selectSnapshotsToEvict(
      merged.map((entry) => ({
        key: snapshotStorageKey(userId, entry.requestKey),
        savedAt: entry.savedAt,
      })),
      userId,
    );
    const evictSet = new Set(evictKeys);
    const kept = merged.filter(
      (entry) => !evictSet.has(snapshotStorageKey(userId, entry.requestKey)),
    );
    await writeIndex(userId, kept);
    await deleteKeys(evictKeys);
  } catch {
    // Quota / private-mode / transient failures: the in-memory render stands.
  }
}

/** Persist one context's snapshot (best-effort), evicting the oldest beyond the cap. */
export async function writeDashboardSnapshot(
  userId: string,
  data: DashboardSnapshotRecord["data"],
  context: DashboardSnapshotRecord["context"],
): Promise<void> {
  await writeDashboardSnapshots(userId, [{ data, context }]);
}

/** Drop every cached context for this account (mutation / force-refresh invalidation). */
export async function clearDashboardSnapshots(userId: string): Promise<void> {
  if (!hasIndexedDb()) return;
  const keys = await readAllKeys(userId);
  await deleteKeys([...keys, snapshotIndexStorageKey(userId)]);
}

/** Drop every stored snapshot for every account (sign-out, shared-device isolation). */
export async function clearAllDashboardSnapshots(): Promise<void> {
  if (!hasIndexedDb()) return;
  try {
    await runRequest("readwrite", (store) => store.clear());
  } catch {
    // Best-effort, like the page-cache purge it accompanies.
  }
}
