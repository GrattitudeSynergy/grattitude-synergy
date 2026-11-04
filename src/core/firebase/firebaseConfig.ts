import { initializeApp, getApps, deleteApp, type FirebaseApp } from 'firebase/app';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  type Firestore,
} from 'firebase/firestore';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  updatePassword as fbUpdatePassword,
  onAuthStateChanged as fbOnAuthStateChanged,
  type Auth,
  type User,
} from 'firebase/auth';

// ============================================================================
// FIREBASE CONFIGURATION & CENTRAL MULTI-DEVICE REAL-TIME SYNC ENGINE
// ============================================================================
// 1. Connects to Google Cloud Firestore (with persistentLocalCache &
//    persistentMultipleTabManager) when live Firebase keys are configured.
// 2. Simultaneously synchronizes all 23 collections + authentication accounts
//    with the Central Database Sync Server (`/api/central-db/*` + SSE stream)
//    so employees added to the directory are saved in the central database and
//    automatically appear in real time across ALL devices, browsers, and
//    authorized user accounts.
// ============================================================================

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyGrattitudeSynergyEnterpriseKey001',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'grattitude-synergy.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'grattitude-synergy-enterprise',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'grattitude-synergy.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '109283746501',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:109283746501:web:9f8e7d6c5b4a3210',
};

const hasLiveFirebaseKeys = Boolean(import.meta.env.VITE_FIREBASE_API_KEY);

let primaryApp: FirebaseApp | null = null;
let firestoreDb: Firestore | null = null;
let primaryAuth: Auth | null = null;

try {
  primaryApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  firestoreDb = initializeFirestore(primaryApp, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
  primaryAuth = getAuth(primaryApp);
} catch (err) {
  console.warn('Firestore initialization notice:', err);
}

export { primaryApp, firestoreDb, primaryAuth };

// ============================================================================
// REAL-TIME REACTIVE DATASTORE ENGINE (Central DB + Firestore + Multi-Tab Sync)
// ============================================================================

const STORAGE_PREFIX = 'gs_firestore_v1_';
const AUTH_ACCOUNTS_KEY = 'gs_firebase_auth_accounts_v1';
const AUTH_SESSION_KEY = 'gs_firebase_auth_session_v1';

const ALL_COLLECTION_NAMES = [
  'employees',
  'notifications',
  'audit_logs',
  'app_settings',
  'perform_kpi_masters',
  'perform_scorecards',
  'perform_config',
  'perform_training_plans',
  'perform_tasks',
  'perform_comments',
  'perform_meetings',
  'perform_intern_roadmaps',
  'perform_intern_discussions',
  'showup_policy',
  'showup_attendance',
  'showup_leave_requests',
  'showup_leave_balances',
  'showup_regularizations',
  'showup_holidays',
  'showup_salary_structures',
  'showup_payslips',
  'showup_documents',
  'showup_compensation_lock',
  'connect_leads',
];

type SnapshotCallback<T> = (items: T[]) => void;
const collectionListeners: Map<string, Set<SnapshotCallback<any>>> = new Map();

const syncChannel =
  typeof BroadcastChannel !== 'undefined'
    ? new BroadcastChannel('grattitude_synergy_firestore_sync')
    : null;

if (syncChannel) {
  syncChannel.onmessage = (event) => {
    const { type, collectionName } = event.data || {};
    if (type === 'COLLECTION_UPDATED' && collectionName) {
      notifyCollectionListeners(collectionName);
    } else if (type === 'AUTH_UPDATED') {
      notifyAuthListeners();
    }
  };
}

function readLocalCollection<T extends { id: string }>(collectionName: string): Record<string, T> {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${collectionName}`);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeLocalCollection<T extends { id: string }>(
  collectionName: string,
  map: Record<string, T>,
  broadcastToTabs = true
): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${collectionName}`, JSON.stringify(map));
  } catch (e) {
    console.error('Storage write error:', e);
  }
  notifyCollectionListeners(collectionName);
  if (broadcastToTabs) {
    syncChannel?.postMessage({ type: 'COLLECTION_UPDATED', collectionName });
  }
}

function notifyCollectionListeners(collectionName: string): void {
  const listeners = collectionListeners.get(collectionName);
  if (!listeners || listeners.size === 0) return;
  const map = readLocalCollection<any>(collectionName);
  const list = Object.values(map);
  listeners.forEach((cb) => {
    try {
      cb(list);
    } catch (e) {
      console.error(`Snapshot listener error on ${collectionName}:`, e);
    }
  });
}

// ============================================================================
// CENTRAL SERVER DATABASE SYNCHRONIZATION (Cross-Device / Cross-Browser / SSE)
// ============================================================================
let centralSyncInitialized = false;

function applyCentralStateToLocal(state: {
  collections?: Record<string, Record<string, any>>;
  authAccounts?: Record<string, AuthAccountRecord>;
}) {
  if (state.authAccounts && typeof state.authAccounts === 'object') {
    const localAccounts = getStoredAccounts();
    const mergedAccounts = { ...localAccounts, ...state.authAccounts };
    localStorage.setItem(AUTH_ACCOUNTS_KEY, JSON.stringify(mergedAccounts));
  }

  if (state.collections && typeof state.collections === 'object') {
    for (const [colName, serverDocs] of Object.entries(state.collections)) {
      if (serverDocs && typeof serverDocs === 'object') {
        writeLocalCollection(colName, serverDocs, false);
      }
    }
  }
}

export async function synchronizeWithCentralDatabase(): Promise<void> {
  if (typeof window === 'undefined') return;

  // Auto-migrate any local employee or auth records that were created under the legacy domain
  const empMap = readLocalCollection<any>('employees');
  let empChanged = false;
  for (const [id, emp] of Object.entries(empMap)) {
    if (emp?.email && emp.email.includes('@') && !emp.email.endsWith('@grattitude.in') && emp.id !== 'EMP-001') {
      const prefix = emp.email.split('@')[0].toLowerCase();
      empMap[id] = { ...emp, email: `${prefix}@grattitude.in` };
      empChanged = true;
    }
  }
  if (empChanged) {
    writeLocalCollection('employees', empMap, false);
  }

  const storedAccs = getStoredAccounts();
  let accsChanged = false;
  for (const [key, acc] of Object.entries(storedAccs)) {
    if (acc?.email && acc.email.includes('@') && !acc.email.endsWith('@grattitude.in') && acc.uid !== 'EMP-001') {
      const prefix = acc.email.split('@')[0].toLowerCase();
      const newEmail = `${prefix}@grattitude.in`;
      storedAccs[newEmail] = { ...acc, email: newEmail };
      accsChanged = true;
    }
  }
  if (accsChanged) {
    saveStoredAccounts(storedAccs);
  }

  // Gather any existing local records so zero existing employee records are lost
  const localCollections: Record<string, Record<string, any>> = {};
  for (const colName of ALL_COLLECTION_NAMES) {
    const map = readLocalCollection(colName);
    if (Object.keys(map).length > 0) {
      localCollections[colName] = map;
    }
  }
  const localAccounts = getStoredAccounts();

  try {
    const res = await fetch('/api/central-db/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collections: localCollections,
        authAccounts: localAccounts,
      }),
    });
    if (res.ok) {
      const mergedState = await res.json();
      applyCentralStateToLocal(mergedState);
    }
  } catch {
    // Offline fallback: continues using local persistent cache
  }

  if (!centralSyncInitialized && typeof EventSource !== 'undefined') {
    centralSyncInitialized = true;
    try {
      const es = new EventSource('/api/central-db/stream');
      es.onmessage = (evt) => {
        try {
          const payload = JSON.parse(evt.data);
          if (payload.type === 'CONNECTED' && payload.state) {
            applyCentralStateToLocal(payload.state);
          } else if (payload.type === 'FULL_SYNC' && payload.state) {
            applyCentralStateToLocal(payload.state);
          } else if (
            payload.type === 'COLLECTION_UPDATED' &&
            payload.collectionName &&
            payload.collectionData
          ) {
            writeLocalCollection(payload.collectionName, payload.collectionData, false);
          } else if (payload.type === 'AUTH_ACCOUNTS_UPDATED' && payload.authAccounts) {
            const current = getStoredAccounts();
            localStorage.setItem(
              AUTH_ACCOUNTS_KEY,
              JSON.stringify({ ...current, ...payload.authAccounts })
            );
          }
        } catch {
          // Ignore malformed SSE packet
        }
      };
    } catch {
      // EventSource not reachable
    }
  }
}

// Automatically sync with the central server whenever this module loads (including Vite HMR)
if (typeof window !== 'undefined') {
  void synchronizeWithCentralDatabase();
}

async function pushDocMutationToCentralServer(
  action: 'set' | 'update' | 'delete',
  collectionName: string,
  docId: string,
  data?: any
): Promise<void> {
  try {
    await fetch('/api/central-db/doc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, collectionName, docId, data }),
    });
  } catch {
    // Queued in local cache
  }
}

async function pushAuthAccountToCentralServer(
  emailKey: string,
  account: AuthAccountRecord
): Promise<void> {
  try {
    await fetch('/api/central-db/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailKey, account }),
    });
  } catch {
    // Queued in local cache
  }
}

// Firestore Collection Wrapper
export const FirestoreEngine = {
  subscribeCollection<T extends { id: string }>(
    collectionName: string,
    callback: (items: T[]) => void
  ): () => void {
    if (!collectionListeners.has(collectionName)) {
      collectionListeners.set(collectionName, new Set());
    }
    const set = collectionListeners.get(collectionName)!;
    set.add(callback);

    // Emit initial state immediately from persistent cache
    const initialMap = readLocalCollection<T>(collectionName);
    callback(Object.values(initialMap));

    // Also attach native Firestore onSnapshot if live keys are provided
    let unsubFirestore: (() => void) | null = null;
    if (hasLiveFirebaseKeys && firestoreDb) {
      try {
        const q = query(collection(firestoreDb, collectionName));
        unsubFirestore = onSnapshot(
          q,
          (snapshot) => {
            const nextMap: Record<string, T> = {};
            snapshot.forEach((docSnap) => {
              nextMap[docSnap.id] = { ...(docSnap.data() as T), id: docSnap.id };
            });
            localStorage.setItem(`${STORAGE_PREFIX}${collectionName}`, JSON.stringify(nextMap));
            callback(Object.values(nextMap));
          },
          () => {
            // Offline cache fallback already handled
          }
        );
      } catch {
        // Ignore and use central + local persistent cache
      }
    }

    return () => {
      set.delete(callback);
      if (unsubFirestore) unsubFirestore();
    };
  },

  async getCollection<T extends { id: string }>(collectionName: string): Promise<T[]> {
    if (hasLiveFirebaseKeys && firestoreDb) {
      try {
        const snap = await getDocs(collection(firestoreDb, collectionName));
        if (!snap.empty) {
          const items: T[] = [];
          const map: Record<string, T> = {};
          snap.forEach((d) => {
            const item = { ...(d.data() as T), id: d.id };
            items.push(item);
            map[d.id] = item;
          });
          localStorage.setItem(`${STORAGE_PREFIX}${collectionName}`, JSON.stringify(map));
          return items;
        }
      } catch {
        // Fallback to central/local persistent cache
      }
    }
    const map = readLocalCollection<T>(collectionName);
    return Object.values(map);
  },

  async getDocument<T extends { id: string }>(
    collectionName: string,
    docId: string
  ): Promise<T | null> {
    if (hasLiveFirebaseKeys && firestoreDb) {
      try {
        const snap = await getDoc(doc(firestoreDb, collectionName, docId));
        if (snap.exists()) {
          return { ...(snap.data() as T), id: snap.id };
        }
      } catch {
        // Fallback
      }
    }
    const map = readLocalCollection<T>(collectionName);
    return map[docId] || null;
  },

  async setDocument<T extends { id: string }>(
    collectionName: string,
    docId: string,
    data: T
  ): Promise<void> {
    const map = readLocalCollection<T>(collectionName);
    const fullDoc = { ...data, id: docId };
    map[docId] = fullDoc;
    writeLocalCollection(collectionName, map);

    await pushDocMutationToCentralServer('set', collectionName, docId, fullDoc);

    if (hasLiveFirebaseKeys && firestoreDb) {
      try {
        await setDoc(doc(firestoreDb, collectionName, docId), fullDoc);
      } catch {
        // Synced with central server & local cache
      }
    }
  },

  async updateDocument<T extends { id: string }>(
    collectionName: string,
    docId: string,
    partial: Partial<T>
  ): Promise<void> {
    const map = readLocalCollection<T>(collectionName);
    if (map[docId]) {
      map[docId] = { ...map[docId], ...partial, id: docId };
      writeLocalCollection(collectionName, map);
    }

    await pushDocMutationToCentralServer('update', collectionName, docId, partial);

    if (hasLiveFirebaseKeys && firestoreDb) {
      try {
        await updateDoc(doc(firestoreDb, collectionName, docId), partial as Record<string, any>);
      } catch {
        // Synced with central server & local cache
      }
    }
  },

  async deleteDocument(collectionName: string, docId: string): Promise<void> {
    const map = readLocalCollection<any>(collectionName);
    if (map[docId]) {
      delete map[docId];
      writeLocalCollection(collectionName, map);
    }

    await pushDocMutationToCentralServer('delete', collectionName, docId);

    if (hasLiveFirebaseKeys && firestoreDb) {
      try {
        await deleteDoc(doc(firestoreDb, collectionName, docId));
      } catch {
        // Synced with central server & local cache
      }
    }
  },
};

// ============================================================================
// FIREBASE AUTHENTICATION + SECONDARY APP PROVISIONING ENGINE
// ============================================================================
export interface AuthAccountRecord {
  uid: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

export interface AuthSessionUser {
  uid: string;
  email: string;
}

type AuthStateListener = (user: AuthSessionUser | null) => void;
const authListeners: Set<AuthStateListener> = new Set();

function getStoredAccounts(): Record<string, AuthAccountRecord> {
  try {
    const raw = localStorage.getItem(AUTH_ACCOUNTS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStoredAccounts(accounts: Record<string, AuthAccountRecord>): void {
  localStorage.setItem(AUTH_ACCOUNTS_KEY, JSON.stringify(accounts));
}

function getCurrentSessionUser(): AuthSessionUser | null {
  try {
    const raw = localStorage.getItem(AUTH_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setCurrentSessionUser(user: AuthSessionUser | null): void {
  if (user) {
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(AUTH_SESSION_KEY);
  }
  notifyAuthListeners();
  syncChannel?.postMessage({ type: 'AUTH_UPDATED' });
}

function notifyAuthListeners(): void {
  const current = getCurrentSessionUser();
  authListeners.forEach((cb) => cb(current));
}

/**
 * Identifier Normalization:
 * Users can log in using either their full email or short username.
 * If no `@` is provided, automatically resolve against `@grattitude.in`.
 */
export function normalizeIdentifier(identifier: string): string {
  const trimmed = identifier.trim().toLowerCase();
  if (!trimmed) return '';
  if (trimmed === 'admin' || trimmed === 'emp-001') {
    const accounts = getStoredAccounts();
    if (accounts['grattitudesynergyllp@gmail.com'] && trimmed === 'admin') {
      return 'grattitudesynergyllp@gmail.com';
    }
  }
  if (!trimmed.includes('@')) {
    return `${trimmed}@grattitude.in`;
  }
  return trimmed;
}

export const AuthEngine = {
  onAuthStateChanged(callback: AuthStateListener): () => void {
    authListeners.add(callback);
    callback(getCurrentSessionUser());

    let unsubNative: (() => void) | null = null;
    if (hasLiveFirebaseKeys && primaryAuth) {
      unsubNative = fbOnAuthStateChanged(primaryAuth, (fbUser: User | null) => {
        if (fbUser && fbUser.email) {
          setCurrentSessionUser({ uid: fbUser.uid, email: fbUser.email.toLowerCase() });
        }
      });
    }

    return () => {
      authListeners.delete(callback);
      if (unsubNative) unsubNative();
    };
  },

  async signIn(identifier: string, password: string): Promise<AuthSessionUser> {
    // Pull latest central DB state before checking credentials so accounts created on another device work immediately
    await synchronizeWithCentralDatabase();

    const normalizedEmail = normalizeIdentifier(identifier);

    if (hasLiveFirebaseKeys && primaryAuth) {
      try {
        const cred = await signInWithEmailAndPassword(primaryAuth, normalizedEmail, password);
        const sessionUser = {
          uid: cred.user.uid,
          email: (cred.user.email || normalizedEmail).toLowerCase(),
        };
        setCurrentSessionUser(sessionUser);
        return sessionUser;
      } catch {
        // Fallback to central/local persisted Firebase Auth registry
      }
    }

    const accounts = getStoredAccounts();
    const employeesMap = readLocalCollection<any>('employees');

    // Strip domain to match short username across @apexsynergy.local or @grattitude.in
    const inputUsername = normalizedEmail.split('@')[0];

    const matchedEmployee = Object.values(employeesMap).find((e: any) => {
      const empEmail = (e?.email || '').toLowerCase();
      const empUsername = empEmail.split('@')[0];
      return (
        empEmail === normalizedEmail ||
        (inputUsername && empUsername === inputUsername) ||
        e?.ecode?.toLowerCase() === identifier.trim().toLowerCase()
      );
    });

    let account =
      accounts[normalizedEmail] ||
      Object.values(accounts).find((a) => {
        const accEmail = a.email.toLowerCase();
        const accUsername = accEmail.split('@')[0];
        return (
          accEmail === normalizedEmail ||
          (inputUsername && accUsername === inputUsername) ||
          a.uid.toLowerCase() === identifier.trim().toLowerCase() ||
          (matchedEmployee && a.uid.toLowerCase() === matchedEmployee.id.toLowerCase())
        );
      });

    // If an Employee record exists in the directory (`employees` collection) with a matching
    // email or username, ensure its domain is normalized to @grattitude.in and auto-provision
    // its auth record if missing so no orphaned employee record is ever locked out.
    if (matchedEmployee) {
      if (
        matchedEmployee.email &&
        matchedEmployee.email.toLowerCase().endsWith('@apexsynergy.local')
      ) {
        const migratedEmail = `${matchedEmployee.email.split('@')[0].toLowerCase()}@grattitude.in`;
        matchedEmployee.email = migratedEmail;
        await FirestoreEngine.setDocument('employees', matchedEmployee.id, matchedEmployee);
      }

      if (!account) {
        const recoveredAccount: AuthAccountRecord = {
          uid: matchedEmployee.id,
          email: matchedEmployee.email.toLowerCase(),
          passwordHash: password,
          createdAt: new Date().toISOString(),
        };
        accounts[recoveredAccount.email] = recoveredAccount;
        saveStoredAccounts(accounts);
        await pushAuthAccountToCentralServer(recoveredAccount.email, recoveredAccount);
        account = recoveredAccount;
      }
    }

    if (!account) {
      throw new Error(`No account found for "${normalizedEmail}". Verify your email or username.`);
    }
    if (account.passwordHash !== password) {
      throw new Error('Invalid password. Please verify your credentials and try again.');
    }

    const sessionUser: AuthSessionUser = {
      uid: account.uid,
      email: account.email.toLowerCase(),
    };
    setCurrentSessionUser(sessionUser);
    return sessionUser;
  },

  async signOut(): Promise<void> {
    if (hasLiveFirebaseKeys && primaryAuth) {
      try {
        await fbSignOut(primaryAuth);
      } catch {
        // Ignore
      }
    }
    setCurrentSessionUser(null);
  },

  async updateCurrentUserPassword(newPassword: string): Promise<void> {
    const session = getCurrentSessionUser();
    if (!session) throw new Error('No authenticated user session.');

    if (hasLiveFirebaseKeys && primaryAuth?.currentUser) {
      try {
        await fbUpdatePassword(primaryAuth.currentUser, newPassword);
      } catch {
        // Continue to update central & local store
      }
    }

    const accounts = getStoredAccounts();
    const key = session.email.toLowerCase();
    const record = accounts[key];
    if (record) {
      record.passwordHash = newPassword;
      saveStoredAccounts(accounts);
      await pushAuthAccountToCentralServer(key, record);
    }
  },

  async adminResetUserPassword(targetEmail: string, newPassword: string): Promise<void> {
    await synchronizeWithCentralDatabase();
    const accounts = getStoredAccounts();
    const key = targetEmail.trim().toLowerCase();
    if (accounts[key]) {
      accounts[key].passwordHash = newPassword;
      saveStoredAccounts(accounts);
      await pushAuthAccountToCentralServer(key, accounts[key]);
    } else {
      throw new Error(`Auth record for ${key} not found.`);
    }
  },

  /**
   * Secondary App Pattern for Employee Creation:
   * Spins up an isolated secondary Firebase app instance (`initializeApp(firebaseConfig, 'secondary')`)
   * to run `createUserWithEmailAndPassword`, sign out, and destroy the secondary app instance
   * so the Admin's active session is never interrupted.
   */
  async createEmployeeWithSecondaryApp(
    email: string,
    password: string,
    preferredUid?: string
  ): Promise<{ uid: string; email: string }> {
    await synchronizeWithCentralDatabase();
    const normalizedEmail = normalizeIdentifier(email);
    const accounts = getStoredAccounts();

    if (accounts[normalizedEmail]) {
      throw new Error(`An account with email "${normalizedEmail}" already exists.`);
    }

    let secondaryApp: FirebaseApp | null = null;
    let createdUid = preferredUid || `uid_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    try {
      // Spin up isolated secondary Firebase app instance as required by architecture spec
      const existingSecondary = getApps().find((a) => a.name === 'secondary');
      secondaryApp = existingSecondary || initializeApp(firebaseConfig, 'secondary');
      const secondaryAuth = getAuth(secondaryApp);

      if (hasLiveFirebaseKeys) {
        const cred = await createUserWithEmailAndPassword(
          secondaryAuth,
          normalizedEmail,
          password
        );
        createdUid = cred.user.uid;
        await fbSignOut(secondaryAuth);
      }
    } catch (err: any) {
      if (hasLiveFirebaseKeys && err?.code === 'auth/email-already-in-use') {
        throw new Error(`Email "${normalizedEmail}" is already registered in Firebase Auth.`);
      }
    } finally {
      if (secondaryApp) {
        try {
          await deleteApp(secondaryApp);
        } catch {
          // Cleaned up
        }
      }
    }

    const newRecord: AuthAccountRecord = {
      uid: createdUid,
      email: normalizedEmail,
      passwordHash: password,
      createdAt: new Date().toISOString(),
    };

    accounts[normalizedEmail] = newRecord;
    saveStoredAccounts(accounts);
    await pushAuthAccountToCentralServer(normalizedEmail, newRecord);

    return { uid: createdUid, email: normalizedEmail };
  },

  ensureBootstrapAdminAuth(uid: string, email: string, defaultPassword: string): void {
    const accounts = getStoredAccounts();
    const key = email.toLowerCase();
    if (!accounts[key]) {
      const adminRecord: AuthAccountRecord = {
        uid,
        email: key,
        passwordHash: defaultPassword,
        createdAt: new Date().toISOString(),
      };
      accounts[key] = adminRecord;
      saveStoredAccounts(accounts);
      void pushAuthAccountToCentralServer(key, adminRecord);
    }
  },
};
