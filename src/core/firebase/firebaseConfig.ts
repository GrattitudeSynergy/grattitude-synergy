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
// FIREBASE CONFIGURATION & CENTRAL CLOUD MULTI-DEVICE REAL-TIME SYNC ENGINE
// ============================================================================
// 1. Central Cloud Database over HTTPS (`CLOUD_DIRECTORY_OBJECT_URL` &
//    `CLOUD_WORKFLOW_OBJECT_URL` + `CLOUD_REALTIME_TOPIC_URL` SSE stream) so
//    deployed builds (Vercel, Netlify, Render, Cloudflare) AND all devices,
//    browsers, and incognito windows stay synchronized in real time.
// 2. Local Central Server (`/api/central-db/*` + SSE stream) when running on
//    the Vite dev/preview server.
// 3. Google Cloud Firestore (`persistentLocalCache` & `persistentMultipleTabManager`)
//    when live Firebase keys are configured.
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

// Dedicated HTTPS Cloud Database Endpoints (CORS-enabled across all domains & devices)
const CLOUD_DIRECTORY_OBJECT_URL =
  'https://api.restful-api.dev/objects/ff808181a09d98f701a1a52ceba72bcb';
const CLOUD_WORKFLOW_OBJECT_URL =
  'https://api.restful-api.dev/objects/ff808181a09d98f701a1a52faf702bce';
const CLOUD_REALTIME_TOPIC_URL = 'https://ntfy.sh/grattitude_synergy_enterprise_sync_v1';

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
// REAL-TIME REACTIVE DATASTORE ENGINE (Central Cloud + Firestore + Multi-Tab)
// ============================================================================

const STORAGE_PREFIX = 'gs_firestore_v1_';
const AUTH_ACCOUNTS_KEY = 'gs_firebase_auth_accounts_v1';
const AUTH_SESSION_KEY = 'gs_firebase_auth_session_v1';
const DELETED_DOCS_KEY = 'gs_firestore_deleted_docs_v1';

const DIRECTORY_COLLECTION_NAMES = [
  'employees',
  'app_settings',
  'showup_compensation_lock',
  'perform_config',
];

const STATIC_SEED_COLLECTION_NAMES = [
  'perform_kpi_masters',
  'perform_intern_roadmaps',
  'showup_policy',
];

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

const WORKFLOW_COLLECTION_NAMES = ALL_COLLECTION_NAMES.filter(
  (c) => !DIRECTORY_COLLECTION_NAMES.includes(c) && !STATIC_SEED_COLLECTION_NAMES.includes(c)
);

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

function getDeletedDocsMap(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(DELETED_DOCS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveDeletedDocsMap(map: Record<string, boolean>): void {
  try {
    localStorage.setItem(DELETED_DOCS_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota errors
  }
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
// UNIFIED EMPLOYEE & AUTH ACCOUNT RECONCILIATION
// ============================================================================

function mergeEmployeeRecord(existingEmp: any, incomingEmp: any): any {
  if (!existingEmp) return incomingEmp;
  if (!incomingEmp) return existingEmp;

  // Real Admin-created/edited records always take precedence over cloud-recovered placeholders
  if (existingEmp.isCloudRecovered && !incomingEmp.isCloudRecovered) {
    return {
      ...existingEmp,
      ...incomingEmp,
      passwordHash:
        incomingEmp.passwordHash && incomingEmp.passwordHash !== '__AUTO_BIND_ON_FIRST_LOGIN__'
          ? incomingEmp.passwordHash
          : existingEmp.passwordHash,
      isCloudRecovered: false,
    };
  }
  if (!existingEmp.isCloudRecovered && incomingEmp.isCloudRecovered) {
    return {
      ...incomingEmp,
      ...existingEmp,
      passwordHash:
        existingEmp.passwordHash && existingEmp.passwordHash !== '__AUTO_BIND_ON_FIRST_LOGIN__'
          ? existingEmp.passwordHash
          : incomingEmp.passwordHash,
      isCloudRecovered: false,
    };
  }

  const existingTime = existingEmp.updatedAt ? new Date(existingEmp.updatedAt).getTime() : 0;
  const incomingTime = incomingEmp.updatedAt ? new Date(incomingEmp.updatedAt).getTime() : 0;

  if (incomingTime >= existingTime) {
    return {
      ...existingEmp,
      ...incomingEmp,
      passwordHash:
        incomingEmp.passwordHash && incomingEmp.passwordHash !== '__AUTO_BIND_ON_FIRST_LOGIN__'
          ? incomingEmp.passwordHash
          : existingEmp.passwordHash || incomingEmp.passwordHash,
    };
  }
  return {
    ...incomingEmp,
    ...existingEmp,
    passwordHash:
      existingEmp.passwordHash && existingEmp.passwordHash !== '__AUTO_BIND_ON_FIRST_LOGIN__'
        ? existingEmp.passwordHash
        : incomingEmp.passwordHash || existingEmp.passwordHash,
  };
}

function reconcileEmployeesAndAuth(
  employeesMap: Record<string, any>,
  authAccountsMap: Record<string, AuthAccountRecord>,
  deletedDocs: Record<string, boolean>
): {
  employees: Record<string, any>;
  authAccounts: Record<string, AuthAccountRecord>;
} {
  const nextEmployees: Record<string, any> = {};
  const nextAccounts: Record<string, AuthAccountRecord> = {};

  // 1. Copy non-deleted employees and normalize domains to @grattitude.in
  for (const [id, emp] of Object.entries(employeesMap || {})) {
    if (!emp || deletedDocs[`employees:${id}`]) continue;
    let normalizedEmail = (emp.email || '').trim().toLowerCase();
    if (
      normalizedEmail &&
      normalizedEmail.includes('@') &&
      !normalizedEmail.endsWith('@grattitude.in') &&
      id !== 'EMP-001'
    ) {
      normalizedEmail = `${normalizedEmail.split('@')[0]}@grattitude.in`;
    } else if (normalizedEmail && !normalizedEmail.includes('@') && id !== 'EMP-001') {
      normalizedEmail = `${normalizedEmail}@grattitude.in`;
    }
    const updatedEmp = { ...emp, id, email: normalizedEmail || emp.email };
    nextEmployees[id] = mergeEmployeeRecord(nextEmployees[id], updatedEmp);
  }

  // 2. Copy and normalize authAccounts
  for (const [rawKey, acc] of Object.entries(authAccountsMap || {})) {
    if (!acc || !acc.uid || deletedDocs[`employees:${acc.uid}`]) continue;
    let emailKey = (acc.email || rawKey || '').trim().toLowerCase();
    if (
      emailKey &&
      emailKey.includes('@') &&
      !emailKey.endsWith('@grattitude.in') &&
      acc.uid !== 'EMP-001'
    ) {
      emailKey = `${emailKey.split('@')[0]}@grattitude.in`;
    } else if (emailKey && !emailKey.includes('@') && acc.uid !== 'EMP-001') {
      emailKey = `${emailKey}@grattitude.in`;
    }

    const existingAcc = nextAccounts[emailKey];
    if (
      !existingAcc ||
      (existingAcc.passwordHash === '__AUTO_BIND_ON_FIRST_LOGIN__' &&
        acc.passwordHash &&
        acc.passwordHash !== '__AUTO_BIND_ON_FIRST_LOGIN__')
    ) {
      nextAccounts[emailKey] = {
        ...acc,
        email: emailKey,
      };
    }
  }

  // 3. Ensure every Employee in `employees` has a corresponding AuthAccountRecord
  for (const emp of Object.values(nextEmployees)) {
    const emailKey = (emp.email || '').trim().toLowerCase();
    if (!emailKey) continue;

    const existingAcc = nextAccounts[emailKey];
    if (!existingAcc) {
      nextAccounts[emailKey] = {
        uid: emp.id,
        email: emailKey,
        passwordHash: emp.passwordHash || '__AUTO_BIND_ON_FIRST_LOGIN__',
        createdAt: emp.updatedAt || new Date().toISOString(),
      };
    } else {
      if (
        existingAcc.passwordHash === '__AUTO_BIND_ON_FIRST_LOGIN__' &&
        emp.passwordHash &&
        emp.passwordHash !== '__AUTO_BIND_ON_FIRST_LOGIN__'
      ) {
        existingAcc.passwordHash = emp.passwordHash;
      } else if (
        (!emp.passwordHash || emp.passwordHash === '__AUTO_BIND_ON_FIRST_LOGIN__') &&
        existingAcc.passwordHash &&
        existingAcc.passwordHash !== '__AUTO_BIND_ON_FIRST_LOGIN__'
      ) {
        emp.passwordHash = existingAcc.passwordHash;
      }
    }
  }

  // 4. Ensure every non-deleted AuthAccountRecord has a corresponding Employee record
  //    (Recovers any employee whose directory entry was previously overwritten in localStorage)
  for (const acc of Object.values(nextAccounts)) {
    if (!acc.uid || deletedDocs[`employees:${acc.uid}`]) continue;
    if (!nextEmployees[acc.uid]) {
      const usernamePart = acc.email.split('@')[0] || acc.uid;
      const formattedName = usernamePart
        .split(/[._-]/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');

      nextEmployees[acc.uid] = {
        id: acc.uid,
        ecode: acc.uid.startsWith('EMP-') ? acc.uid : 'EMP-002',
        name: formattedName || acc.uid,
        email: acc.email.toLowerCase(),
        designation: 'Senior Specialist',
        department: 'Engineering',
        vertical: 'Enterprise SaaS',
        level: 3,
        role: 'Employee',
        reportingManagerId: 'EMP-001',
        dateOfJoining: (acc.createdAt || new Date().toISOString()).slice(0, 10),
        status: 'Active',
        isManager: false,
        hasCrmAccess: true,
        isAssociate: false,
        isAccountsStaff: false,
        mustChangePassword: false,
        passwordHash: acc.passwordHash,
        isCloudRecovered: true,
        updatedAt: acc.createdAt || '2026-11-04T00:00:00.000Z',
        personal: {
          address: '',
          emergencyContactName: '',
          emergencyContactPhone: '',
          phone: '',
        },
        employment: {
          workLocation: 'Bengaluru HQ',
          probationPeriodMonths: 3,
          noticePeriodDays: 30,
        },
        bank: {
          accountNumber: '',
          bankName: '',
          ifscCode: '',
          branchName: '',
        },
        legalIdentity: {
          panNumber: '',
          aadhaarNumber: '',
          uanNumber: '',
          passportNumber: '',
        },
      };
    }
  }

  return { employees: nextEmployees, authAccounts: nextAccounts };
}

// ============================================================================
// CENTRAL CLOUD DATABASE & REAL-TIME SSE SYNCHRONIZATION
// ============================================================================

let centralSyncInitialized = false;
let cloudDirectorySyncPromise: Promise<void> = Promise.resolve();
let cloudWorkflowSyncPromise: Promise<void> = Promise.resolve();

async function broadcastCloudRealtimePacket(packet: Record<string, any>): Promise<void> {
  try {
    await fetch(CLOUD_REALTIME_TOPIC_URL, {
      method: 'POST',
      body: JSON.stringify(packet),
    });
  } catch {
    // Ignore if offline
  }
}

function applyIncomingPacketToLocal(payload: any): void {
  if (!payload || typeof payload !== 'object') return;

  if (payload.type === 'DOC_MUTATION' && payload.collectionName && payload.docId) {
    const { action, collectionName, docId, data } = payload;
    const deletedDocs = getDeletedDocsMap();
    const map = readLocalCollection<any>(collectionName);

    if (action === 'delete') {
      deletedDocs[`${collectionName}:${docId}`] = true;
      saveDeletedDocsMap(deletedDocs);
      if (map[docId]) {
        delete map[docId];
        writeLocalCollection(collectionName, map, false);
      }
    } else if (action === 'set' || action === 'update') {
      if (deletedDocs[`${collectionName}:${docId}`]) {
        delete deletedDocs[`${collectionName}:${docId}`];
        saveDeletedDocsMap(deletedDocs);
      }
      const existing = map[docId] || { id: docId };
      map[docId] =
        collectionName === 'employees'
          ? mergeEmployeeRecord(existing, { ...existing, ...data, id: docId })
          : { ...existing, ...data, id: docId };
      writeLocalCollection(collectionName, map, false);

      if (collectionName === 'employees' && map[docId]?.email) {
        const accs = getStoredAccounts();
        const reconciled = reconcileEmployeesAndAuth(map, accs, deletedDocs);
        saveStoredAccounts(reconciled.authAccounts);
      }
    }
  } else if (payload.type === 'AUTH_ACCOUNT_UPSERT' && payload.emailKey && payload.account) {
    const deletedDocs = getDeletedDocsMap();
    const accs = getStoredAccounts();
    accs[payload.emailKey.toLowerCase()] = payload.account;
    const empMap = readLocalCollection<any>('employees');
    const reconciled = reconcileEmployeesAndAuth(empMap, accs, deletedDocs);
    saveStoredAccounts(reconciled.authAccounts);
    writeLocalCollection('employees', reconciled.employees, false);
  }
}

function applyCentralStateToLocal(state: {
  collections?: Record<string, Record<string, any>>;
  authAccounts?: Record<string, AuthAccountRecord>;
  deletedDocIds?: Record<string, boolean>;
}): void {
  const localDeleted = getDeletedDocsMap();
  const mergedDeleted = { ...localDeleted, ...(state.deletedDocIds || {}) };
  saveDeletedDocsMap(mergedDeleted);

  const localEmployees = readLocalCollection<any>('employees');
  const incomingEmployees = state.collections?.employees || {};
  const combinedEmployees: Record<string, any> = { ...localEmployees };

  for (const [id, emp] of Object.entries(incomingEmployees)) {
    if (!mergedDeleted[`employees:${id}`]) {
      combinedEmployees[id] = mergeEmployeeRecord(combinedEmployees[id], emp);
    }
  }

  const localAccounts = getStoredAccounts();
  const incomingAccounts = state.authAccounts || {};
  const combinedAccounts: Record<string, AuthAccountRecord> = {
    ...localAccounts,
    ...incomingAccounts,
  };

  for (const [emailKey, acc] of Object.entries(incomingAccounts)) {
    const existing = localAccounts[emailKey];
    if (
      existing &&
      existing.passwordHash &&
      existing.passwordHash !== '__AUTO_BIND_ON_FIRST_LOGIN__' &&
      acc.passwordHash === '__AUTO_BIND_ON_FIRST_LOGIN__'
    ) {
      combinedAccounts[emailKey] = existing;
    }
  }

  const reconciled = reconcileEmployeesAndAuth(
    combinedEmployees,
    combinedAccounts,
    mergedDeleted
  );
  saveStoredAccounts(reconciled.authAccounts);
  writeLocalCollection('employees', reconciled.employees, false);

  if (state.collections && typeof state.collections === 'object') {
    for (const [colName, serverDocs] of Object.entries(state.collections)) {
      if (colName === 'employees') continue;
      if (serverDocs && typeof serverDocs === 'object') {
        const localDocs = readLocalCollection<any>(colName);
        const mergedCol: Record<string, any> = { ...localDocs, ...serverDocs };
        for (const docId of Object.keys(mergedCol)) {
          if (mergedDeleted[`${colName}:${docId}`]) {
            delete mergedCol[docId];
          }
        }
        writeLocalCollection(colName, mergedCol, false);
      }
    }
  }
}

async function syncDirectoryWithCloud(options?: {
  pushChanges?: boolean;
}): Promise<void> {
  const runSync = async () => {
    try {
      const res = await fetch(CLOUD_DIRECTORY_OBJECT_URL, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!res.ok) return;
      const cloudObj = await res.json();
      const cloudData = cloudObj?.data || {};

      const localDeleted = getDeletedDocsMap();
      const cloudDeleted = cloudData.deletedDocIds || {};
      const mergedDeleted: Record<string, boolean> = { ...cloudDeleted, ...localDeleted };
      saveDeletedDocsMap(mergedDeleted);

      const cloudEmployees = cloudData.employees || {};
      const localEmployees = readLocalCollection<any>('employees');
      const mergedEmployees: Record<string, any> = {};

      const allEmpIds = new Set([
        ...Object.keys(cloudEmployees),
        ...Object.keys(localEmployees),
      ]);
      for (const id of allEmpIds) {
        if (mergedDeleted[`employees:${id}`]) continue;
        mergedEmployees[id] = mergeEmployeeRecord(cloudEmployees[id], localEmployees[id]);
      }

      const cloudAccounts: Record<string, AuthAccountRecord> = cloudData.authAccounts || {};
      const localAccounts = getStoredAccounts();
      const mergedAccounts: Record<string, AuthAccountRecord> = {
        ...cloudAccounts,
        ...localAccounts,
      };
      for (const [key, cloudAcc] of Object.entries(cloudAccounts)) {
        const localAcc = localAccounts[key];
        if (
          localAcc &&
          localAcc.passwordHash === '__AUTO_BIND_ON_FIRST_LOGIN__' &&
          cloudAcc.passwordHash &&
          cloudAcc.passwordHash !== '__AUTO_BIND_ON_FIRST_LOGIN__'
        ) {
          mergedAccounts[key] = cloudAcc;
        } else if (
          localAcc &&
          localAcc.passwordHash &&
          localAcc.passwordHash !== '__AUTO_BIND_ON_FIRST_LOGIN__' &&
          (!cloudAcc.passwordHash || cloudAcc.passwordHash === '__AUTO_BIND_ON_FIRST_LOGIN__')
        ) {
          mergedAccounts[key] = localAcc;
        }
      }

      const reconciled = reconcileEmployeesAndAuth(
        mergedEmployees,
        mergedAccounts,
        mergedDeleted
      );

      saveStoredAccounts(reconciled.authAccounts);
      writeLocalCollection('employees', reconciled.employees, false);

      // Merge other directory config collections (app_settings, locks, perform_config)
      const mergedDirectoryCollections: Record<string, Record<string, any>> = {};
      for (const colName of DIRECTORY_COLLECTION_NAMES) {
        if (colName === 'employees') continue;
        const cDocs = cloudData[colName] || {};
        const lDocs = readLocalCollection<any>(colName);
        const mergedCol = options?.pushChanges
          ? { ...cDocs, ...lDocs }
          : { ...lDocs, ...cDocs };
        writeLocalCollection(colName, mergedCol, false);
        mergedDirectoryCollections[colName] = mergedCol;
      }

      const shouldPushToCloud =
        Boolean(options?.pushChanges) ||
        Object.keys(reconciled.employees).length !== Object.keys(cloudEmployees).length ||
        Object.keys(reconciled.authAccounts).length !== Object.keys(cloudAccounts).length ||
        JSON.stringify(reconciled.employees) !== JSON.stringify(cloudEmployees) ||
        JSON.stringify(reconciled.authAccounts) !== JSON.stringify(cloudAccounts);

      if (shouldPushToCloud) {
        const nextPayload = {
          name: 'grattitude-synergy-central-db',
          data: {
            employees: reconciled.employees,
            authAccounts: reconciled.authAccounts,
            deletedDocIds: mergedDeleted,
            ...mergedDirectoryCollections,
            updatedAt: new Date().toISOString(),
          },
        };
        await fetch(CLOUD_DIRECTORY_OBJECT_URL, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(nextPayload),
        });
      }
    } catch {
      // Offline fallback: continues using local persistent cache
    }
  };

  cloudDirectorySyncPromise = cloudDirectorySyncPromise.then(runSync, runSync);
  return cloudDirectorySyncPromise;
}

async function syncWorkflowsWithCloud(options?: {
  pushChanges?: boolean;
}): Promise<void> {
  const runSync = async () => {
    try {
      const res = await fetch(CLOUD_WORKFLOW_OBJECT_URL, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!res.ok) return;
      const cloudObj = await res.json();
      const cloudCollections: Record<string, Record<string, any>> =
        cloudObj?.data?.collections || {};
      const mergedDeleted = getDeletedDocsMap();

      const nextCloudCollections: Record<string, Record<string, any>> = {};
      let hasChangesToPush = Boolean(options?.pushChanges);

      for (const colName of WORKFLOW_COLLECTION_NAMES) {
        const cDocs = cloudCollections[colName] || {};
        const lDocs = readLocalCollection<any>(colName);
        const mergedCol: Record<string, any> = options?.pushChanges
          ? { ...cDocs, ...lDocs }
          : { ...lDocs, ...cDocs };

        for (const docId of Object.keys(mergedCol)) {
          if (mergedDeleted[`${colName}:${docId}`]) {
            delete mergedCol[docId];
          }
        }

        if (Object.keys(mergedCol).length > 0) {
          writeLocalCollection(colName, mergedCol, false);
          nextCloudCollections[colName] = mergedCol;
        }
        if (JSON.stringify(mergedCol) !== JSON.stringify(cDocs)) {
          hasChangesToPush = true;
        }
      }

      if (hasChangesToPush) {
        await fetch(CLOUD_WORKFLOW_OBJECT_URL, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            name: 'grattitude-synergy-workflows-db',
            data: {
              collections: nextCloudCollections,
              updatedAt: new Date().toISOString(),
            },
          }),
        });
      }
    } catch {
      // Offline fallback
    }
  };

  cloudWorkflowSyncPromise = cloudWorkflowSyncPromise.then(runSync, runSync);
  return cloudWorkflowSyncPromise;
}

export async function synchronizeWithCentralDatabase(): Promise<void> {
  if (typeof window === 'undefined') return;

  // 1. Reconcile local employees & authAccounts first
  const localDeleted = getDeletedDocsMap();
  const localReconciled = reconcileEmployeesAndAuth(
    readLocalCollection<any>('employees'),
    getStoredAccounts(),
    localDeleted
  );
  saveStoredAccounts(localReconciled.authAccounts);
  if (Object.keys(localReconciled.employees).length > 0) {
    writeLocalCollection('employees', localReconciled.employees, false);
  }

  // 2. Sync with Central Cloud Database over HTTPS (Works on Vercel, Netlify, mobile, all browsers)
  await syncDirectoryWithCloud();
  void syncWorkflowsWithCloud();

  // 3. Also sync with Local Vite Server (`/api/central-db/merge`) when running locally
  const localCollections: Record<string, Record<string, any>> = {};
  for (const colName of ALL_COLLECTION_NAMES) {
    const map = readLocalCollection(colName);
    if (Object.keys(map).length > 0) {
      localCollections[colName] = map;
    }
  }

  try {
    const res = await fetch('/api/central-db/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        collections: localCollections,
        authAccounts: getStoredAccounts(),
        deletedDocIds: getDeletedDocsMap(),
      }),
    });
    if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
      const mergedState = await res.json();
      applyCentralStateToLocal(mergedState);
    }
  } catch {
    // Running on static cloud host without local Vite middleware; Cloud HTTPS DB handles sync
  }

  // 4. Attach Real-Time SSE Listeners (Cloud SSE + Local SSE + Periodic Cloud Poll)
  if (!centralSyncInitialized) {
    centralSyncInitialized = true;

    // 4A. Global Cloud Real-Time SSE Stream (`ntfy.sh`)
    if (typeof EventSource !== 'undefined') {
      try {
        const cloudEs = new EventSource(`${CLOUD_REALTIME_TOPIC_URL}/sse`);
        cloudEs.onmessage = (evt) => {
          try {
            const outer = JSON.parse(evt.data);
            if (outer?.event === 'message' && outer?.message) {
              const inner = JSON.parse(outer.message);
              applyIncomingPacketToLocal(inner);
              void syncDirectoryWithCloud();
            }
          } catch {
            // Ignore malformed SSE packet
          }
        };
      } catch {
        // Fallback to periodic poll below
      }

      // 4B. Local Dev Server SSE Stream (if running locally on Vite)
      try {
        const localEs = new EventSource('/api/central-db/stream');
        localEs.onmessage = (evt) => {
          try {
            const payload = JSON.parse(evt.data);
            if ((payload.type === 'CONNECTED' || payload.type === 'FULL_SYNC') && payload.state) {
              applyCentralStateToLocal(payload.state);
            } else if (
              payload.type === 'COLLECTION_UPDATED' &&
              payload.collectionName &&
              payload.collectionData
            ) {
              applyCentralStateToLocal({
                collections: { [payload.collectionName]: payload.collectionData },
              });
            } else if (payload.type === 'AUTH_ACCOUNTS_UPDATED' && payload.authAccounts) {
              applyCentralStateToLocal({ authAccounts: payload.authAccounts });
            }
          } catch {
            // Ignore
          }
        };
        localEs.onerror = () => {
          localEs.close();
        };
      } catch {
        // Ignore on static cloud hosts
      }
    }

    // 4C. Real-Time Cloud Poll & Focus Sync (guarantees sync across devices even behind firewalls)
    setInterval(() => {
      void syncDirectoryWithCloud();
    }, 5000);

    window.addEventListener('focus', () => {
      void syncDirectoryWithCloud();
      void syncWorkflowsWithCloud();
    });
  }
}

if (typeof window !== 'undefined') {
  void synchronizeWithCentralDatabase();
}

async function pushDocMutationToCentralServer(
  action: 'set' | 'update' | 'delete',
  collectionName: string,
  docId: string,
  data?: any
): Promise<void> {
  // 1. Broadcast real-time delta to all connected cloud devices immediately
  void broadcastCloudRealtimePacket({
    type: 'DOC_MUTATION',
    action,
    collectionName,
    docId,
    data,
    timestamp: new Date().toISOString(),
  });

  // 2. Persist to Central Cloud Database over HTTPS
  if (DIRECTORY_COLLECTION_NAMES.includes(collectionName)) {
    await syncDirectoryWithCloud({ pushChanges: true });
  } else if (WORKFLOW_COLLECTION_NAMES.includes(collectionName)) {
    void syncWorkflowsWithCloud({ pushChanges: true });
  }

  // 3. Also persist to local Vite dev server if running locally
  try {
    await fetch('/api/central-db/doc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, collectionName, docId, data }),
    });
  } catch {
    // Handled by Cloud HTTPS DB
  }
}

async function pushAuthAccountToCentralServer(
  emailKey: string,
  account: AuthAccountRecord
): Promise<void> {
  void broadcastCloudRealtimePacket({
    type: 'AUTH_ACCOUNT_UPSERT',
    emailKey: emailKey.toLowerCase(),
    account,
    timestamp: new Date().toISOString(),
  });

  await syncDirectoryWithCloud({ pushChanges: true });

  try {
    await fetch('/api/central-db/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailKey, account }),
    });
  } catch {
    // Handled by Cloud HTTPS DB
  }
}

// ============================================================================
// FIRESTORE COLLECTION WRAPPER
// ============================================================================

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

    // Trigger background cloud sync when subscribing to employees
    if (collectionName === 'employees') {
      void syncDirectoryWithCloud();
    }

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
        // Ignore and use central cloud + local persistent cache
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
        // Fallback to central cloud/local persistent cache
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
    const deletedDocs = getDeletedDocsMap();
    if (deletedDocs[`${collectionName}:${docId}`]) {
      delete deletedDocs[`${collectionName}:${docId}`];
      saveDeletedDocsMap(deletedDocs);
    }

    const map = readLocalCollection<T>(collectionName);
    const fullDoc = { ...data, id: docId };
    map[docId] = fullDoc;
    writeLocalCollection(collectionName, map);

    await pushDocMutationToCentralServer('set', collectionName, docId, fullDoc);

    if (hasLiveFirebaseKeys && firestoreDb) {
      try {
        await setDoc(doc(firestoreDb, collectionName, docId), fullDoc);
      } catch {
        // Synced with central cloud server & local cache
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
        // Synced with central cloud server & local cache
      }
    }
  },

  async deleteDocument(collectionName: string, docId: string): Promise<void> {
    const deletedDocs = getDeletedDocsMap();
    deletedDocs[`${collectionName}:${docId}`] = true;
    saveDeletedDocsMap(deletedDocs);

    const map = readLocalCollection<any>(collectionName);
    const targetDoc = map[docId];
    if (map[docId]) {
      delete map[docId];
      writeLocalCollection(collectionName, map);
    }

    if (collectionName === 'employees') {
      const accs = getStoredAccounts();
      for (const [k, acc] of Object.entries(accs)) {
        if (acc.uid === docId || (targetDoc?.email && k === targetDoc.email.toLowerCase())) {
          delete accs[k];
        }
      }
      saveStoredAccounts(accs);
    }

    await pushDocMutationToCentralServer('delete', collectionName, docId);

    if (hasLiveFirebaseKeys && firestoreDb) {
      try {
        await deleteDoc(doc(firestoreDb, collectionName, docId));
      } catch {
        // Synced with central cloud server & local cache
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
    // Pull latest central cloud DB state before checking credentials so accounts created on any device work immediately
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
        // Fallback to central cloud/local persisted Firebase Auth registry
      }
    }

    const accounts = getStoredAccounts();
    const employeesMap = readLocalCollection<any>('employees');
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
          passwordHash:
            matchedEmployee.passwordHash &&
            matchedEmployee.passwordHash !== '__AUTO_BIND_ON_FIRST_LOGIN__'
              ? matchedEmployee.passwordHash
              : password,
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

    // If the account was recovered in the cloud directory and awaits initial password binding, bind on sign-in
    if (account.passwordHash === '__AUTO_BIND_ON_FIRST_LOGIN__') {
      account.passwordHash = password;
      accounts[account.email.toLowerCase()] = account;
      saveStoredAccounts(accounts);
      if (matchedEmployee) {
        matchedEmployee.passwordHash = password;
        employeesMap[matchedEmployee.id] = matchedEmployee;
        writeLocalCollection('employees', employeesMap, false);
      }
      await pushAuthAccountToCentralServer(account.email.toLowerCase(), account);
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
        // Continue to update central cloud & local store
      }
    }

    const accounts = getStoredAccounts();
    const key = session.email.toLowerCase();
    const record = accounts[key] || {
      uid: session.uid,
      email: key,
      passwordHash: newPassword,
      createdAt: new Date().toISOString(),
    };
    record.passwordHash = newPassword;
    accounts[key] = record;
    saveStoredAccounts(accounts);

    const empMap = readLocalCollection<any>('employees');
    if (empMap[session.uid]) {
      empMap[session.uid] = {
        ...empMap[session.uid],
        passwordHash: newPassword,
        updatedAt: new Date().toISOString(),
      };
      writeLocalCollection('employees', empMap);
    }

    await pushAuthAccountToCentralServer(key, record);
  },

  async adminResetUserPassword(targetEmail: string, newPassword: string): Promise<void> {
    await synchronizeWithCentralDatabase();
    const accounts = getStoredAccounts();
    const key = normalizeIdentifier(targetEmail);
    const empMap = readLocalCollection<any>('employees');
    const matchedEmp = Object.values(empMap).find(
      (e: any) => (e?.email || '').toLowerCase() === key
    );

    const record: AuthAccountRecord = accounts[key] || {
      uid: matchedEmp?.id || key,
      email: key,
      passwordHash: newPassword,
      createdAt: new Date().toISOString(),
    };
    record.passwordHash = newPassword;
    accounts[key] = record;
    saveStoredAccounts(accounts);

    if (matchedEmp && empMap[matchedEmp.id]) {
      empMap[matchedEmp.id] = {
        ...empMap[matchedEmp.id],
        passwordHash: newPassword,
        updatedAt: new Date().toISOString(),
      };
      writeLocalCollection('employees', empMap);
    }

    await pushAuthAccountToCentralServer(key, record);
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
    const empMap = readLocalCollection<any>('employees');

    const deletedDocs = getDeletedDocsMap();
    const existingActiveEmp = Object.values(empMap).find(
      (e: any) =>
        (e?.email || '').toLowerCase() === normalizedEmail &&
        !deletedDocs[`employees:${e.id}`] &&
        !e?.isCloudRecovered
    );

    if (accounts[normalizedEmail] && existingActiveEmp) {
      throw new Error(`An account with email "${normalizedEmail}" already exists.`);
    }

    let secondaryApp: FirebaseApp | null = null;
    let createdUid = preferredUid || `uid_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    try {
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

    if (deletedDocs[`employees:${createdUid}`]) {
      delete deletedDocs[`employees:${createdUid}`];
      saveDeletedDocsMap(deletedDocs);
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
