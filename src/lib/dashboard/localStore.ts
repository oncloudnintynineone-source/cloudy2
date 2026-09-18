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
  isSnapshotRecordUsable,
  selectSnapshotsToEvict,
  snapshotStorageKey,
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

/** Every usable stored record with its storage key (best-effort, never throws). */
function readAllRecords(): Promise<{ key: string; record: DashboardSnapshotRecord }[]> {
  return openDb().then(
    (db) =>
      new Promise((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, "readonly");
          const store = tx.objectStore(STORE_NAME);
          // Both requests are issued synchronously so the transaction can't
          // auto-commit between them.
          const keysRequest = store.getAllKeys();
          const valuesRequest = store.getAll();
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

/** Run a write operation over one store, resolving when the transaction commits. */
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

/** Delete the given storage keys in one transaction (best-effort). */
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

/** Every cached context for this account (for the in-memory hydration). */
export async function readDashboardSnapshots(userId: string): Promise<DashboardSnapshotRecord[]> {
  if (!hasIndexedDb()) return [];
  const prefix = `${userId}::`;
  const all = await readAllRecords();
  return all.filter((entry) => entry.key.startsWith(prefix)).map((entry) => entry.record);
}

/** Drop this account's oldest contexts so at most the cap remain. */
async function pruneSnapshots(userId: string): Promise<void> {
  const all = await readAllRecords();
  const evict = selectSnapshotsToEvict(
    all.map((entry) => ({ key: entry.key, savedAt: entry.record.savedAt })),
    userId,
  );
  await deleteKeys(evict);
}

/**
 * Persist several contexts in one transaction, then prune once. The tab preload
 * writes every warm context at once; doing this per record meant one `put` plus
 * a full-store `getAll`/`getAllKeys` prune per record — O(tabs²) reads. This is
 * best-effort like the single-record write.
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
  try {
    await runWrite((store) => {
      for (const entry of entries) {
        const record: DashboardSnapshotRecord = {
          version: DASHBOARD_SNAPSHOT_VERSION,
          savedAt,
          context: entry.context,
          data: entry.data,
        };
        store.put(record, snapshotStorageKey(userId, entry.context.requestKey));
      }
    });
    await pruneSnapshots(userId);
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
  const prefix = `${userId}::`;
  const all = await readAllRecords();
  await deleteKeys(all.filter((entry) => entry.key.startsWith(prefix)).map((entry) => entry.key));
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
