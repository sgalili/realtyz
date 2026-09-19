export type PublicListingDraftFields = {
  /** מתווך / פרטי */
  publisherType: 'broker' | 'private' | '';
  dealType: 'sale' | 'rent' | '';
  propertyType: string;
  city: string;
  street: string;
  houseNumber: string;
  apartmentNumber: string;
  neighborhood: string;
  area: string;
  district: string;
  /** Free-text fallback address (kept for backwards compatibility). */
  address: string;
  rooms: string;
  floor: string;
  totalFloors: string;
  elevator: boolean;
  parking: boolean;
  balcony: boolean;
  condition: string;
  airDirections: string;
  openView: boolean;
  arnona: string;
  vaadBayit: string;
  builtSqm: string;
  gardenSqm: string;
  sqm: string;
  price: string;
  entryDate: string;
  description: string;
  contactName: string;
  contactWhatsapp: string;
  termsAccepted: boolean;
  marketingAccepted: boolean;
};

export const EMPTY_PUBLIC_LISTING_DRAFT: PublicListingDraftFields = {
  publisherType: '',
  dealType: '',
  propertyType: '',
  city: '',
  street: '',
  houseNumber: '',
  apartmentNumber: '',
  neighborhood: '',
  area: '',
  district: '',
  address: '',
  rooms: '',
  floor: '',
  totalFloors: '',
  elevator: false,
  parking: false,
  balcony: false,
  condition: '',
  airDirections: '',
  openView: false,
  arnona: '',
  vaadBayit: '',
  builtSqm: '',
  gardenSqm: '',
  sqm: '',
  price: '',
  entryDate: '',
  description: '',
  contactName: '',
  contactWhatsapp: '',
  termsAccepted: false,
  marketingAccepted: false,
};

export type PublicListingDraft = PublicListingDraftFields & {
  files: File[];
  videos?: File[];
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

export async function savePublicListingDraft(fields: PublicListingDraftFields, files: File[], videos: File[] = []) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ ...fields, files, videos, savedAt: Date.now() }, KEY);
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
  return value ? { ...EMPTY_PUBLIC_LISTING_DRAFT, ...value } : null;
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
