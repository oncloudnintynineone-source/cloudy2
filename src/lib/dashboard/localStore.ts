/**
 * IndexedDB persistence for the dashboard snapshot (docs/pwa-offline.md).
 *
 * One latest record per account is stored under the `cloudy2` database. The
 * record is read on a cold open to paint the last-known grid immediately, then
 * overwritten by the next successful revalidation. This is a pure performance
 * cache — it is never authoritative, and every read is guarded so a missing /
 * corrupt / unavailable IndexedDB degrades to "no cache" instead of an error.
 *
 * All functions are safe to call on the server (they no-op) so the module can
 * be imported from shared code without a `typeof window` dance at every call
 * site.
 */

import {
  DASHBOARD_SNAPSHOT_VERSION,
  isSnapshotRecordUsable,
  type DashboardSnapshotRecord,
} from "./snapshot";

const DB_NAME = "cloudy2";
const DB_VERSION = 1;
const STORE_NAME = "dashboardSnapshots";

function hasIndexedDb(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
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

/** The last snapshot stored for this account, or null when none/usable-mismatch. */
export async function readDashboardSnapshot(
  userId: string,
): Promise<DashboardSnapshotRecord | null> {
  if (!hasIndexedDb()) return null;
  try {
    const record = await runRequest<DashboardSnapshotRecord>("readonly", (store) =>
      store.get(userId) as IDBRequest<DashboardSnapshotRecord>,
    );
    return isSnapshotRecordUsable(record) ? record : null;
  } catch {
    return null;
  }
}

/** Persist the latest snapshot for this account (best-effort). */
export async function writeDashboardSnapshot(
  userId: string,
  data: DashboardSnapshotRecord["data"],
  context: DashboardSnapshotRecord["context"],
): Promise<void> {
  if (!hasIndexedDb()) return;
  const record: DashboardSnapshotRecord = {
    version: DASHBOARD_SNAPSHOT_VERSION,
    savedAt: Date.now(),
    context,
    data,
  };
  try {
    await runRequest("readwrite", (store) => store.put(record, userId));
  } catch {
    // Quota / private-mode / transient failures: the in-memory render stands.
  }
}

/** Drop every stored snapshot (sign-out, shared-device isolation). */
export async function clearAllDashboardSnapshots(): Promise<void> {
  if (!hasIndexedDb()) return;
  try {
    await runRequest("readwrite", (store) => store.clear());
  } catch {
    // Best-effort, like the page-cache purge it accompanies.
  }
}
