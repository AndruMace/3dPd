// Local persistence for the saved run (PD's game.dat + depthN.dat). IndexedDB works in browsers and inside the
// Capacitor web views on iOS and Android, where it lives in the app's own data container.
const DB = 'pd3d';
const STORE = 'kv';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let db: Promise<IDBDatabase> | null = null;

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  db ??= open();
  const d = await db;
  return new Promise((resolve, reject) => {
    const req = fn(d.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const Storage = {
  get<T>(key: string): Promise<T | undefined> {
    return tx('readonly', (s) => s.get(key) as IDBRequest<T | undefined>).catch(() => undefined);
  },
  set(key: string, value: unknown): Promise<void> {
    return tx('readwrite', (s) => s.put(value, key)).then(
      () => undefined,
      () => undefined,
    );
  },
  remove(key: string): Promise<void> {
    return tx('readwrite', (s) => s.delete(key)).then(
      () => undefined,
      () => undefined,
    );
  },
};
