const DATABASE = "langbai-metadata-inspector";
const STORE = "snapshots";
const LAST_IMAGE = "last-image";

interface StoredMetadataImage {
  id: string;
  name: string;
  type: string;
  lastModified: number;
  blob: Blob;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transaction<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = database.transaction(STORE, mode);
      const request = run(tx.objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    database.close();
  }
}

export async function saveMetadataSnapshot(file: File): Promise<void> {
  if (typeof window !== "undefined" && window.naiDesktop?.saveMetadataSnapshot) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    const result = await window.naiDesktop.saveMetadataSnapshot({
      name: file.name,
      type: file.type,
      lastModified: file.lastModified,
      base64: btoa(binary),
    });
    if (result.ok) return;
  }
  if (typeof indexedDB === "undefined") return;
  const record: StoredMetadataImage = {
    id: LAST_IMAGE,
    name: file.name,
    type: file.type,
    lastModified: file.lastModified,
    blob: file,
  };
  await transaction("readwrite", (store) => store.put(record));
}

export async function loadMetadataSnapshot(): Promise<File | null> {
  if (typeof window !== "undefined" && window.naiDesktop?.loadMetadataSnapshot) {
    const result = await window.naiDesktop.loadMetadataSnapshot();
    if (result.ok && result.snapshot) {
      const binary = atob(result.snapshot.base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      return new File([bytes], result.snapshot.name || "metadata-image.png", {
        type: result.snapshot.type,
        lastModified: result.snapshot.lastModified,
      });
    }
  }
  if (typeof indexedDB === "undefined") return null;
  const record = await transaction<StoredMetadataImage | undefined>(
    "readonly",
    (store) => store.get(LAST_IMAGE),
  );
  if (!record?.blob) return null;
  return new File([record.blob], record.name || "metadata-image.png", {
    type: record.type || record.blob.type,
    lastModified: record.lastModified || Date.now(),
  });
}
