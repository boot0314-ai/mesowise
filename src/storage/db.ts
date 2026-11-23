import { createDefaultProfile } from '../data/constants';
import { AppState } from '../types/models';

const DB_NAME = 'mesowise-db';
const DB_VERSION = 1;
const STORE_NAME = 'app_state';
const STATE_KEY = 'primary';
const LS_FALLBACK_KEY = 'mesowise_app_state_v1';

export function createInitialAppState(): AppState {
  return {
    profile: createDefaultProfile(),
    customExercises: [],
    mesocycles: [],
    activeMesoId: null,
    painHistory: [],
  };
}

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function readFromLocalStorage(): AppState | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(LS_FALLBACK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppState;
    return validateAppState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeToLocalStorage(state: AppState): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(state));
  } catch {
    // Ignore quota / private browsing errors
  }
}

/**
 * Validates imported or persisted AppState shape safely.
 */
export function validateAppState(candidate: unknown): candidate is AppState {
  if (!candidate || typeof candidate !== 'object') return false;
  const obj = candidate as Record<string, unknown>;
  if (!obj.profile || typeof obj.profile !== 'object') return false;
  const prof = obj.profile as Record<string, unknown>;
  if (prof.unit !== 'lb' && prof.unit !== 'kg') return false;
  if (typeof prof.joints !== 'object' || prof.joints === null) return false;
  if (!Array.isArray(prof.equipment)) return false;
  if (!Array.isArray(obj.mesocycles)) return false;
  if (!Array.isArray(obj.customExercises)) return false;
  if (!Array.isArray(obj.painHistory)) return false;
  return true;
}

/**
 * Loads AppState from IndexedDB with automatic localStorage fallback.
 */
export async function loadAppState(): Promise<AppState> {
  if (hasIndexedDb()) {
    try {
      const db = await openDb();
      const result = await new Promise<AppState | null>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(STATE_KEY);
        req.onsuccess = () => resolve((req.result as AppState | undefined) ?? null);
        req.onerror = () => reject(req.error);
      });
      db.close();
      if (result && validateAppState(result)) {
        return result;
      }
    } catch {
      // Fall through to localStorage
    }
  }

  return readFromLocalStorage() ?? createInitialAppState();
}

/**
 * Saves AppState to IndexedDB and mirrors to localStorage fallback.
 */
export async function saveAppState(state: AppState): Promise<void> {
  writeToLocalStorage(state);
  if (!hasIndexedDb()) return;

  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(state, STATE_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    db.close();
  } catch {
    // localStorage mirror already written
  }
}

export function exportStateJson(state: AppState): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      app: 'MesoWise',
      version: 1,
      data: state,
    },
    null,
    2
  );
}

export function importStateJson(json: string): AppState {
  const parsed = JSON.parse(json) as { data?: unknown } | unknown;
  const candidate =
    parsed && typeof parsed === 'object' && 'data' in parsed
      ? (parsed as { data: unknown }).data
      : parsed;

  if (!validateAppState(candidate)) {
    throw new Error('Invalid MesoWise backup JSON format.');
  }
  return candidate;
}
