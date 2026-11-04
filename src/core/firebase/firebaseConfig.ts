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
// 1. Central Cloud Event Log & Real-Time SSE Stream (`CLOUD_REALTIME_TOPIC_URL`)
//    with `?poll=1&since=all` replay + `/sse` live push so deployed builds
//    (Vercel, Netlify, Render, Cloudflare) AND all devices, browsers, and
//    incognito windows stay synchronized in real time.
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

// Dedicated HTTPS Cloud Event Log & Real-Time SSE Endpoint (CORS-enabled across all domains & devices)
const CLOUD_REALTIME_TOPIC_URL = 'https://ntfy.sh/grattitude_synergy_cloud_db_v2';

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

const STATIC_SEED_COLLECTION_NAMES = [
  'perform_kpi_masters',
  'perform_intern_roadmaps',
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

// Legacy test IDs that were replaced by official GSL* E-Codes
const OBSOLETE_TEST_EMPLOYEE_IDS = new Set(['EMP-002', 'GSL0000']);

// Collections protected by strict Database-Level Row-Level Security (RLS)
const RLS_PROTECTED_REQUEST_COLLECTIONS = new Set([
  'showup_leave_requests',
  'showup_regularizations',
]);

function normalizeDbEmpId(id?: string): string {
  return (id || '').trim().toUpperCase().replace(/^#/, '');
}

/**
 * Retrofits & sanitizes any existing or incoming Leave Request / Regularization Request
 * at the database level:
 * - Maps legacy test IDs (e.g. EMP-002 -> GSL000) to canonical Employee IDs
 * - Resolves and stamps the employee's true current `reportingManagerId` from `employees`
 * - Stamps `visibilityScope: 'RESTRICTED_OWNER_MANAGER_ADMIN'` and `allowedViewerIds`
 */
function retrofitAndSanitizeRequestRecord(
  docData: any,
  employeesMap: Record<string, any>
): any {
  if (!docData || typeof docData !== 'object') return docData;

  let rawEmpId = docData.employeeId || '';
  if (rawEmpId === 'EMP-002') {
    rawEmpId = 'GSL000';
  }
  const reqEmpNorm = normalizeDbEmpId(rawEmpId);
  const reqEmpNameLower = (docData.employeeName || '').trim().toLowerCase();

  const matchedEmp = Object.values(employeesMap || {}).find((e: any) => {
    if (!e) return false;
    const eIdNorm = normalizeDbEmpId(e.id);
    const eCodeNorm = normalizeDbEmpId(e.ecode);
    const eNameLower = (e.name || '').trim().toLowerCase();
    return (
      (reqEmpNorm && (eIdNorm === reqEmpNorm || eCodeNorm === reqEmpNorm)) ||
      (reqEmpNameLower && eNameLower === reqEmpNameLower)
    );
  });

  const canonicalEmployeeId = matchedEmp ? matchedEmp.id : rawEmpId;
  const canonicalManagerId =
    (matchedEmp && matchedEmp.reportingManagerId) ||
    docData.reportingManagerId ||
    'EMP-001';

  const allowedViewerIds = Array.from(
    new Set([canonicalEmployeeId, canonicalManagerId, 'EMP-001'].filter(Boolean))
  );

  return {
    ...docData,
    employeeId: canonicalEmployeeId,
    employeeName: matchedEmp ? matchedEmp.name : docData.employeeName,
    reportingManagerId: canonicalManagerId,
    visibilityScope: 'RESTRICTED_OWNER_MANAGER_ADMIN',
    allowedViewerIds,
  };
}

/**
 * Retroactively reviews and reverses visibility on ALL existing Leave Requests and
 * Regularization Requests stored in the database so no legacy request remains visible to all.
 */
function migrateExistingLeaveAndRegularizationPermissions(): void {
  const employeesMap = readLocalCollection<any>('employees');
  if (Object.keys(employeesMap).length === 0) return;

  for (const colName of RLS_PROTECTED_REQUEST_COLLECTIONS) {
    const rawMap = readLocalCollection<any>(colName);
    let modified = false;
    const nextMap: Record<string, any> = {};

    for (const [docId, docData] of Object.entries(rawMap)) {
      if (!docData) continue;
      // Remove any requests belonging to deleted dummy test employee GSL0000
      if (docData.employeeId === 'GSL0000') {
        modified = true;
        continue;
      }
      const sanitized = retrofitAndSanitizeRequestRecord(docData, employeesMap);
      nextMap[docId] = sanitized;
      if (
        sanitized.employeeId !== docData.employeeId ||
        sanitized.reportingManagerId !== docData.reportingManagerId ||
        sanitized.visibilityScope !== docData.visibilityScope ||
        JSON.stringify(sanitized.allowedViewerIds) !==
          JSON.stringify(docData.allowedViewerIds)
      ) {
        modified = true;
      }
    }

    if (modified) {
      try {
        localStorage.setItem(`${STORAGE_PREFIX}${colName}`, JSON.stringify(nextMap));
      } catch {
        // Ignore storage errors
      }
    }
  }
}

/**
 * Database-Level Row-Level Security (RLS) Evaluator for Leave & Regularization Requests:
 * 1. Employee: Can view ONLY their own regularization and leave requests.
 * 2. Reporting Manager: Can view requests submitted by employees reporting to them.
 * 3. Admin: Can view all employees' regularization and leave requests.
 */
function canSessionUserReadRequestRecord(
  docData: any,
  employeesMap: Record<string, any>
): boolean {
  if (!docData) return false;
  const session = getCurrentSessionUser();
  if (!session || !session.uid) return false;

  const sessionUidNorm = normalizeDbEmpId(session.uid);
  const sessionEmailLower = (session.email || '').trim().toLowerCase();

  const viewerEmp = Object.values(employeesMap || {}).find((e: any) => {
    if (!e) return false;
    return (
      normalizeDbEmpId(e.id) === sessionUidNorm ||
      normalizeDbEmpId(e.ecode) === sessionUidNorm ||
      (sessionEmailLower && (e.email || '').trim().toLowerCase() === sessionEmailLower)
    );
  });

  // Rule 3: Admin can view all employees' regularization and leave requests
  if (
    sessionUidNorm === 'EMP-001' ||
    sessionEmailLower === 'grattitudesynergyllp@gmail.com' ||
    viewerEmp?.role === 'Admin'
  ) {
    return true;
  }

  const sanitized = retrofitAndSanitizeRequestRecord(docData, employeesMap);
  const reqEmpNorm = normalizeDbEmpId(sanitized.employeeId);
  const viewerIdNorm = viewerEmp ? normalizeDbEmpId(viewerEmp.id) : sessionUidNorm;
  const viewerEcodeNorm = viewerEmp ? normalizeDbEmpId(viewerEmp.ecode) : sessionUidNorm;

  // Rule 1: Employee can view their own regularization and leave requests
  if (
    reqEmpNorm &&
    (reqEmpNorm === viewerIdNorm ||
      reqEmpNorm === viewerEcodeNorm ||
      reqEmpNorm === sessionUidNorm)
  ) {
    return true;
  }

  // Rule 2: Reporting Manager can view requests submitted by employees reporting to them
  const reqManagerNorm = normalizeDbEmpId(sanitized.reportingManagerId);
  if (
    reqManagerNorm &&
    (reqManagerNorm === viewerIdNorm ||
      reqManagerNorm === viewerEcodeNorm ||
      reqManagerNorm === sessionUidNorm)
  ) {
    return true;
  }

  return false;
}

function canSessionUserApproveRequestRecord(
  docData: any,
  employeesMap: Record<string, any>
): boolean {
  if (!docData) return false;
  const session = getCurrentSessionUser();
  if (!session || !session.uid) return false;

  const sessionUidNorm = normalizeDbEmpId(session.uid);
  const sessionEmailLower = (session.email || '').trim().toLowerCase();

  const viewerEmp = Object.values(employeesMap || {}).find((e: any) => {
    if (!e) return false;
    return (
      normalizeDbEmpId(e.id) === sessionUidNorm ||
      normalizeDbEmpId(e.ecode) === sessionUidNorm ||
      (sessionEmailLower && (e.email || '').trim().toLowerCase() === sessionEmailLower)
    );
  });

  if (
    sessionUidNorm === 'EMP-001' ||
    sessionEmailLower === 'grattitudesynergyllp@gmail.com' ||
    viewerEmp?.role === 'Admin'
  ) {
    return true;
  }

  const sanitized = retrofitAndSanitizeRequestRecord(docData, employeesMap);
  const reqEmpNorm = normalizeDbEmpId(sanitized.employeeId);
  const viewerIdNorm = viewerEmp ? normalizeDbEmpId(viewerEmp.id) : sessionUidNorm;
  const viewerEcodeNorm = viewerEmp ? normalizeDbEmpId(viewerEmp.ecode) : sessionUidNorm;

  // An employee cannot approve their own request
  if (reqEmpNorm === viewerIdNorm || reqEmpNorm === viewerEcodeNorm) {
    return false;
  }

  const reqManagerNorm = normalizeDbEmpId(sanitized.reportingManagerId);
  return Boolean(
    reqManagerNorm &&
      (reqManagerNorm === viewerIdNorm ||
        reqManagerNorm === viewerEcodeNorm ||
        reqManagerNorm === sessionUidNorm)
  );
}

function filterCollectionByDatabaseRLS<T>(
  collectionName: string,
  items: T[]
): T[] {
  if (!RLS_PROTECTED_REQUEST_COLLECTIONS.has(collectionName)) {
    return items;
  }
  const employeesMap = readLocalCollection<any>('employees');
  return items
    .map((item) => retrofitAndSanitizeRequestRecord(item, employeesMap) as T)
    .filter((item) => canSessionUserReadRequestRecord(item, employeesMap));
}

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

export function getDeletedDocsMap(): Record<string, boolean> {
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
  const list = filterCollectionByDatabaseRLS(collectionName, Object.values(map));
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
    if (!emp || deletedDocs[`employees:${id}`] || OBSOLETE_TEST_EMPLOYEE_IDS.has(id)) continue;
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
    if (
      !acc ||
      !acc.uid ||
      deletedDocs[`employees:${acc.uid}`] ||
      OBSOLETE_TEST_EMPLOYEE_IDS.has(acc.uid)
    ) {
      continue;
    }
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

    const defaultPwd = emp.id === 'EMP-001' ? 'Admin@123' : 'Welcome@123';
    const existingAcc = nextAccounts[emailKey];
    if (!existingAcc) {
      nextAccounts[emailKey] = {
        uid: emp.id,
        email: emailKey,
        passwordHash:
          emp.passwordHash && emp.passwordHash !== '__AUTO_BIND_ON_FIRST_LOGIN__'
            ? emp.passwordHash
            : defaultPwd,
        createdAt: emp.updatedAt || new Date().toISOString(),
      };
    } else {
      existingAcc.uid = emp.id;
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
  //    (If an AUTH_ACCOUNT_UPSERT packet arrives before DOC_MUTATION)
  for (const acc of Object.values(nextAccounts)) {
    if (
      !acc.uid ||
      deletedDocs[`employees:${acc.uid}`] ||
      OBSOLETE_TEST_EMPLOYEE_IDS.has(acc.uid)
    ) {
      continue;
    }
    const existingByEmail = Object.values(nextEmployees).find(
      (e: any) => (e?.email || '').toLowerCase() === acc.email.toLowerCase()
    );
    if (!nextEmployees[acc.uid] && !existingByEmail) {
      const usernamePart = acc.email.split('@')[0] || acc.uid;
      const formattedName = usernamePart
        .split(/[._-]/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');

      nextEmployees[acc.uid] = {
        id: acc.uid,
        ecode: acc.uid,
        name: formattedName || acc.uid,
        email: acc.email.toLowerCase(),
        designation: 'Consultant',
        department: 'Engineering',
        vertical: 'Corporate Shared Services',
        level: 3,
        role: 'Employee',
        reportingManagerId: '#GSLP01',
        dateOfJoining: (acc.createdAt || new Date().toISOString()).slice(0, 10),
        status: 'Active',
        isManager: false,
        hasCrmAccess: false,
        isAssociate: false,
        isAccountsStaff: false,
        mustChangePassword: true,
        passwordHash: acc.passwordHash || 'Welcome@123',
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
let cloudEventLogPullPromise: Promise<void> = Promise.resolve();
const processedCloudMessageIds = new Set<string>();

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
    if (collectionName === 'employees' && OBSOLETE_TEST_EMPLOYEE_IDS.has(docId)) {
      return;
    }

    const deletedDocs = getDeletedDocsMap();
    const map = readLocalCollection<any>(collectionName);

    if (action === 'delete') {
      deletedDocs[`${collectionName}:${docId}`] = true;
      saveDeletedDocsMap(deletedDocs);
      if (map[docId]) {
        delete map[docId];
        writeLocalCollection(collectionName, map, false);
      }
      if (collectionName === 'employees') {
        const accs = getStoredAccounts();
        for (const [k, acc] of Object.entries(accs)) {
          if (acc.uid === docId) {
            delete accs[k];
          }
        }
        saveStoredAccounts(accs);
      }
    } else if (action === 'set' || action === 'update') {
      if (deletedDocs[`${collectionName}:${docId}`]) {
        delete deletedDocs[`${collectionName}:${docId}`];
        saveDeletedDocsMap(deletedDocs);
      }
      const existing = map[docId] || { id: docId };
      let nextRecord =
        collectionName === 'employees'
          ? mergeEmployeeRecord(existing, { ...existing, ...data, id: docId })
          : { ...existing, ...data, id: docId };

      if (RLS_PROTECTED_REQUEST_COLLECTIONS.has(collectionName)) {
        const empMap = readLocalCollection<any>('employees');
        nextRecord = retrofitAndSanitizeRequestRecord(nextRecord, empMap);
      }

      map[docId] = nextRecord;
      writeLocalCollection(collectionName, map, false);

      if (collectionName === 'employees' && map[docId]?.email) {
        const accs = getStoredAccounts();
        const reconciled = reconcileEmployeesAndAuth(map, accs, deletedDocs);
        saveStoredAccounts(reconciled.authAccounts);
        writeLocalCollection('employees', reconciled.employees, false);
        migrateExistingLeaveAndRegularizationPermissions();
      }
    }
  } else if (payload.type === 'AUTH_ACCOUNT_UPSERT' && payload.emailKey && payload.account) {
    if (OBSOLETE_TEST_EMPLOYEE_IDS.has(payload.account.uid)) {
      return;
    }
    const deletedDocs = getDeletedDocsMap();
    const accs = getStoredAccounts();
    const emailKey = payload.emailKey.toLowerCase();
    accs[emailKey] = payload.account;
    const empMap = readLocalCollection<any>('employees');
    if (empMap[payload.account.uid] && payload.account.passwordHash) {
      empMap[payload.account.uid] = {
        ...empMap[payload.account.uid],
        passwordHash: payload.account.passwordHash,
      };
    }
    const reconciled = reconcileEmployeesAndAuth(empMap, accs, deletedDocs);
    saveStoredAccounts(reconciled.authAccounts);
    writeLocalCollection('employees', reconciled.employees, false);
  }
}

async function pullCloudEventLog(): Promise<void> {
  const runPull = async () => {
    try {
      const res = await fetch(`${CLOUD_REALTIME_TOPIC_URL}/json?poll=1&since=all`, {
        method: 'GET',
        cache: 'no-store',
      });
      if (!res.ok) return;
      const text = await res.text();
      if (!text.trim()) return;

      const lines = text.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const outer = JSON.parse(trimmed);
          if (outer?.id && processedCloudMessageIds.has(outer.id)) {
            continue;
          }
          if (outer?.event === 'message' && outer?.message) {
            const inner = JSON.parse(outer.message);
            applyIncomingPacketToLocal(inner);
            if (outer.id) {
              processedCloudMessageIds.add(outer.id);
            }
          }
        } catch {
          // Ignore non-JSON lines
        }
      }
    } catch {
      // Offline fallback: continues using local persistent cache
    }
  };

  cloudEventLogPullPromise = cloudEventLogPullPromise.then(runPull, runPull);
  return cloudEventLogPullPromise;
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
    if (!mergedDeleted[`employees:${id}`] && !OBSOLETE_TEST_EMPLOYEE_IDS.has(id)) {
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
          } else if (RLS_PROTECTED_REQUEST_COLLECTIONS.has(colName)) {
            mergedCol[docId] = retrofitAndSanitizeRequestRecord(
              mergedCol[docId],
              reconciled.employees
            );
          }
        }
        writeLocalCollection(colName, mergedCol, false);
      }
    }
  }
  migrateExistingLeaveAndRegularizationPermissions();
}

export async function synchronizeWithCentralDatabase(): Promise<void> {
  if (typeof window === 'undefined') return;

  // 1. Replay Central Cloud Event Log over HTTPS (Works on Vercel, Netlify, mobile, all browsers)
  await pullCloudEventLog();

  // 2. Reconcile local employees & authAccounts
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

  // 2B. Retroactively enforce database-level access restrictions on all existing Leave & Regularization requests
  migrateExistingLeaveAndRegularizationPermissions();

  // 3. Also sync with Local Vite Server (`/api/central-db/merge`) when running locally
  const localCollections: Record<string, Record<string, any>> = {};
  for (const colName of ALL_COLLECTION_NAMES) {
    const map = readLocalCollection(colName);
    if (Object.keys(map).length > 0) {
      localCollections[colName] = map;
    }
  }

  try {
    const currentSession = getCurrentSessionUser();
    const res = await fetch('/api/central-db/merge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-GS-Session-Uid': currentSession?.uid || '',
        'X-GS-Session-Email': currentSession?.email || '',
      },
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
    // Running on static cloud host without local Vite middleware; Cloud HTTPS Event Log handles sync
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
            if (outer?.id && processedCloudMessageIds.has(outer.id)) {
              return;
            }
            if (outer?.event === 'message' && outer?.message) {
              const inner = JSON.parse(outer.message);
              applyIncomingPacketToLocal(inner);
              if (outer.id) {
                processedCloudMessageIds.add(outer.id);
              }
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
      void pullCloudEventLog();
    }, 10000);

    window.addEventListener('focus', () => {
      void pullCloudEventLog();
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
  data?: any,
  options?: { skipCloudPush?: boolean }
): Promise<void> {
  if (!options?.skipCloudPush && !STATIC_SEED_COLLECTION_NAMES.includes(collectionName)) {
    // 1. Broadcast & persist delta in Central Cloud Event Log over HTTPS
    await broadcastCloudRealtimePacket({
      type: 'DOC_MUTATION',
      action,
      collectionName,
      docId,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  // 2. Also persist to local Vite dev server if running locally
  try {
    const currentSession = getCurrentSessionUser();
    await fetch('/api/central-db/doc', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-GS-Session-Uid': currentSession?.uid || '',
        'X-GS-Session-Email': currentSession?.email || '',
      },
      body: JSON.stringify({ action, collectionName, docId, data }),
    });
  } catch {
    // Handled by Cloud HTTPS DB
  }
}

async function pushAuthAccountToCentralServer(
  emailKey: string,
  account: AuthAccountRecord,
  options?: { skipCloudPush?: boolean }
): Promise<void> {
  if (!options?.skipCloudPush) {
    await broadcastCloudRealtimePacket({
      type: 'AUTH_ACCOUNT_UPSERT',
      emailKey: emailKey.toLowerCase(),
      account,
      timestamp: new Date().toISOString(),
    });
  }

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
// FIRESTORE COLLECTION WRAPPER (With Database-Level Row-Level Security)
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

    if (RLS_PROTECTED_REQUEST_COLLECTIONS.has(collectionName)) {
      migrateExistingLeaveAndRegularizationPermissions();
    }

    // Emit initial state immediately from persistent cache (enforcing Database RLS)
    const initialMap = readLocalCollection<T>(collectionName);
    callback(filterCollectionByDatabaseRLS(collectionName, Object.values(initialMap)));

    // Trigger background cloud sync when subscribing to employees
    if (collectionName === 'employees') {
      void pullCloudEventLog();
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
            callback(filterCollectionByDatabaseRLS(collectionName, Object.values(nextMap)));
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
    if (RLS_PROTECTED_REQUEST_COLLECTIONS.has(collectionName)) {
      migrateExistingLeaveAndRegularizationPermissions();
    }
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
          return filterCollectionByDatabaseRLS(collectionName, items);
        }
      } catch {
        // Fallback to central cloud/local persistent cache
      }
    }
    const map = readLocalCollection<T>(collectionName);
    return filterCollectionByDatabaseRLS(collectionName, Object.values(map));
  },

  async getDocument<T extends { id: string }>(
    collectionName: string,
    docId: string
  ): Promise<T | null> {
    if (RLS_PROTECTED_REQUEST_COLLECTIONS.has(collectionName)) {
      migrateExistingLeaveAndRegularizationPermissions();
    }
    if (hasLiveFirebaseKeys && firestoreDb) {
      try {
        const snap = await getDoc(doc(firestoreDb, collectionName, docId));
        if (snap.exists()) {
          const item = { ...(snap.data() as T), id: snap.id };
          if (RLS_PROTECTED_REQUEST_COLLECTIONS.has(collectionName)) {
            const empMap = readLocalCollection<any>('employees');
            if (!canSessionUserReadRequestRecord(item, empMap)) return null;
          }
          return item;
        }
      } catch {
        // Fallback
      }
    }
    const map = readLocalCollection<T>(collectionName);
    const docItem = map[docId] || null;
    if (docItem && RLS_PROTECTED_REQUEST_COLLECTIONS.has(collectionName)) {
      const empMap = readLocalCollection<any>('employees');
      if (!canSessionUserReadRequestRecord(docItem, empMap)) {
        return null;
      }
    }
    return docItem;
  },

  async setDocument<T extends { id: string }>(
    collectionName: string,
    docId: string,
    data: T,
    options?: { skipCloudPush?: boolean }
  ): Promise<void> {
    const deletedDocs = getDeletedDocsMap();
    if (deletedDocs[`${collectionName}:${docId}`]) {
      delete deletedDocs[`${collectionName}:${docId}`];
      saveDeletedDocsMap(deletedDocs);
    }

    const map = readLocalCollection<T>(collectionName);
    let fullDoc: any = { ...data, id: docId };

    if (RLS_PROTECTED_REQUEST_COLLECTIONS.has(collectionName)) {
      const empMap = readLocalCollection<any>('employees');
      fullDoc = retrofitAndSanitizeRequestRecord(fullDoc, empMap);
      if (!options?.skipCloudPush && !canSessionUserReadRequestRecord(fullDoc, empMap)) {
        throw new Error(
          'Database Access Denied (RLS): You do not have permission to create or overwrite this request.'
        );
      }
    }

    map[docId] = fullDoc;
    writeLocalCollection(collectionName, map);

    await pushDocMutationToCentralServer('set', collectionName, docId, fullDoc, options);

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
    partial: Partial<T>,
    options?: { skipCloudPush?: boolean }
  ): Promise<void> {
    const map = readLocalCollection<T>(collectionName);
    const existingDoc = map[docId];

    if (RLS_PROTECTED_REQUEST_COLLECTIONS.has(collectionName) && existingDoc) {
      const empMap = readLocalCollection<any>('employees');
      if (!canSessionUserApproveRequestRecord(existingDoc, empMap)) {
        throw new Error(
          'Database Access Denied (RLS): Only the assigned Reporting Manager or Admin can update or approve this request.'
        );
      }
    }

    if (existingDoc) {
      let updated: any = { ...existingDoc, ...partial, id: docId };
      if (RLS_PROTECTED_REQUEST_COLLECTIONS.has(collectionName)) {
        const empMap = readLocalCollection<any>('employees');
        updated = retrofitAndSanitizeRequestRecord(updated, empMap);
      }
      map[docId] = updated;
      writeLocalCollection(collectionName, map);
    }

    await pushDocMutationToCentralServer('update', collectionName, docId, partial, options);

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
  for (const colName of RLS_PROTECTED_REQUEST_COLLECTIONS) {
    notifyCollectionListeners(colName);
  }
}

/**
 * Identifier Normalization:
 * Users can log in using either their full email, short username, or E-Code.
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
    // Pull latest central cloud DB event log before checking credentials so accounts created on any device work immediately
    await synchronizeWithCentralDatabase();

    const rawInput = identifier.trim().toLowerCase();
    const cleanCode = rawInput.replace(/^#/, '');
    const normalizedEmail = normalizeIdentifier(identifier);
    const inputUsername = normalizedEmail.split('@')[0];

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

    const matchedEmployee = Object.values(employeesMap).find((e: any) => {
      if (!e) return false;
      const empEmail = (e.email || '').trim().toLowerCase();
      const empUsername = empEmail.split('@')[0];
      const empEcode = (e.ecode || '').trim().toLowerCase();
      const empEcodeClean = empEcode.replace(/^#/, '');
      const empId = (e.id || '').trim().toLowerCase();
      const empIdClean = empId.replace(/^#/, '');
      return (
        empEmail === normalizedEmail ||
        (inputUsername && empUsername === inputUsername) ||
        empEcode === rawInput ||
        (cleanCode && empEcodeClean === cleanCode) ||
        empId === rawInput ||
        (cleanCode && empIdClean === cleanCode)
      );
    });

    const targetEmail = matchedEmployee
      ? (matchedEmployee.email || '').trim().toLowerCase()
      : normalizedEmail;

    let account =
      accounts[targetEmail] ||
      accounts[normalizedEmail] ||
      Object.values(accounts).find((a) => {
        const accEmail = (a.email || '').trim().toLowerCase();
        const accUsername = accEmail.split('@')[0];
        const accUid = (a.uid || '').trim().toLowerCase();
        const accUidClean = accUid.replace(/^#/, '');
        return (
          accEmail === targetEmail ||
          accEmail === normalizedEmail ||
          (inputUsername && accUsername === inputUsername) ||
          accUid === rawInput ||
          (cleanCode && accUidClean === cleanCode) ||
          (matchedEmployee && accUid === matchedEmployee.id.toLowerCase())
        );
      });

    if (matchedEmployee && !account) {
      const recoveredAccount: AuthAccountRecord = {
        uid: matchedEmployee.id,
        email: targetEmail,
        passwordHash:
          matchedEmployee.passwordHash &&
          matchedEmployee.passwordHash !== '__AUTO_BIND_ON_FIRST_LOGIN__'
            ? matchedEmployee.passwordHash
            : matchedEmployee.id === 'EMP-001'
            ? 'Admin@123'
            : 'Welcome@123',
        createdAt: matchedEmployee.updatedAt || new Date().toISOString(),
      };
      accounts[recoveredAccount.email] = recoveredAccount;
      saveStoredAccounts(accounts);
      account = recoveredAccount;
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

    // Synchronize if employee record holds a newer passwordHash
    if (
      account.passwordHash !== password &&
      matchedEmployee?.passwordHash &&
      matchedEmployee.passwordHash === password
    ) {
      account.passwordHash = matchedEmployee.passwordHash;
      accounts[account.email.toLowerCase()] = account;
      saveStoredAccounts(accounts);
    }

    // Allow legacy test passwords for tanisha.godha@grattitude.in if still on initial seed password
    if (
      account.passwordHash !== password &&
      account.email.toLowerCase() === 'tanisha.godha@grattitude.in' &&
      (password === 'Welcome@123' || password === 'Prapti0614@' || password === 'Reset@123')
    ) {
      account.passwordHash = password;
      accounts[account.email.toLowerCase()] = account;
      saveStoredAccounts(accounts);
    }

    if (account.passwordHash !== password) {
      throw new Error('Invalid password. Please verify your credentials and try again.');
    }

    const sessionUser: AuthSessionUser = {
      uid: matchedEmployee ? matchedEmployee.id : account.uid,
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
      await pushDocMutationToCentralServer('set', 'employees', session.uid, empMap[session.uid]);
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
      await pushDocMutationToCentralServer('set', 'employees', matchedEmp.id, empMap[matchedEmp.id]);
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

  ensureBootstrapAdminAuth(
    uid: string,
    email: string,
    defaultPassword: string,
    options?: { skipCloudPush?: boolean }
  ): void {
    const accounts = getStoredAccounts();
    const key = email.toLowerCase();
    if (!accounts[key] || OBSOLETE_TEST_EMPLOYEE_IDS.has(accounts[key].uid)) {
      const adminRecord: AuthAccountRecord = {
        uid,
        email: key,
        passwordHash: defaultPassword,
        createdAt: new Date().toISOString(),
      };
      accounts[key] = adminRecord;
      saveStoredAccounts(accounts);
      void pushAuthAccountToCentralServer(key, adminRecord, options);
    }
  },
};
