export type PublicListingDraftFields = {
  dealType: 'sale' | 'rent';
  propertyType: string;
  city: string;
  neighborhood: string;
  address: string;
  price: string;
  rooms: string;
  sqm: string;
  floor: string;
  description: string;
};

export type PublicListingDraft = PublicListingDraftFields & {
  files: File[];
  savedAt: number;
};

const DB_NAME = 'realtyz-public-listing-drafts';
const STORE = 'drafts';
const KEY = 'pending';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function savePublicListingDraft(fields: PublicListingDraftFields, files: File[]) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ ...fields, files, savedAt: Date.now() }, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function readPublicListingDraft(): Promise<PublicListingDraft | null> {
  const db = await openDb();
  const value = await new Promise<PublicListingDraft | null>((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
    request.onsuccess = () => resolve((request.result as PublicListingDraft | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return value;
}

export async function clearPublicListingDraft() {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
