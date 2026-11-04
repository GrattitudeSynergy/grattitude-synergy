import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

// ============================================================================
// CENTRAL REAL-TIME DATABASE SYNC SERVER PLUGIN (Multi-Device & Multi-Account)
// ============================================================================
// Persists all 23 Firestore collections + Auth accounts to a central server
// datastore (`central-cloud-db.json`) and broadcasts updates over Server-Sent
// Events (SSE) so every connected browser, device, and user account stays
// synchronized in real time.

interface CentralDatabaseState {
  collections: Record<string, Record<string, any>>;
  authAccounts: Record<string, any>;
  deletedDocIds: Record<string, boolean>;
  updatedAt: string;
}

function createCentralDatabaseSyncPlugin(): Plugin {
  const dbFilePath = path.resolve(process.cwd(), 'central-cloud-db.json');
  const sseClients = new Set<ServerResponse>();
  const rlsProtectedCollections = new Set(['showup_leave_requests', 'showup_regularizations']);

  const normalizeEmpId = (id?: string): string =>
    (id || '').trim().toUpperCase().replace(/^#/, '');

  const retrofitRequestDoc = (docData: any, employeesMap: Record<string, any>) => {
    if (!docData || typeof docData !== 'object') return docData;
    let rawEmpId = docData.employeeId || '';
    if (rawEmpId === 'EMP-002') rawEmpId = 'GSL000';
    const reqEmpNorm = normalizeEmpId(rawEmpId);
    const reqNameLower = (docData.employeeName || '').trim().toLowerCase();

    const matchedEmp = Object.values(employeesMap || {}).find((e: any) => {
      if (!e) return false;
      return (
        (reqEmpNorm &&
          (normalizeEmpId(e.id) === reqEmpNorm || normalizeEmpId(e.ecode) === reqEmpNorm)) ||
        (reqNameLower && (e.name || '').trim().toLowerCase() === reqNameLower)
      );
    });

    const canonicalEmpId = matchedEmp ? matchedEmp.id : rawEmpId;
    const canonicalMgrId =
      (matchedEmp && matchedEmp.reportingManagerId) || docData.reportingManagerId || 'EMP-001';

    return {
      ...docData,
      employeeId: canonicalEmpId,
      employeeName: matchedEmp ? matchedEmp.name : docData.employeeName,
      reportingManagerId: canonicalMgrId,
      visibilityScope: 'RESTRICTED_OWNER_MANAGER_ADMIN',
      allowedViewerIds: Array.from(
        new Set([canonicalEmpId, canonicalMgrId, 'EMP-001'].filter(Boolean))
      ),
    };
  };

  const enforceServerRequestAclMigration = (state: CentralDatabaseState): CentralDatabaseState => {
    const employeesMap = state.collections?.employees || {};
    for (const colName of rlsProtectedCollections) {
      const colMap = state.collections?.[colName];
      if (!colMap || typeof colMap !== 'object') continue;
      for (const [docId, docData] of Object.entries(colMap)) {
        if (!docData || docData.employeeId === 'GSL0000') {
          delete colMap[docId];
          continue;
        }
        colMap[docId] = retrofitRequestDoc(docData, employeesMap);
      }
    }
    return state;
  };

  const canCallerViewRequest = (
    docData: any,
    callerUid: string,
    callerEmail: string,
    employeesMap: Record<string, any>
  ): boolean => {
    if (!callerUid && !callerEmail) return false;
    const callerUidNorm = normalizeEmpId(callerUid);
    const callerEmailLower = (callerEmail || '').trim().toLowerCase();

    const viewerEmp = Object.values(employeesMap || {}).find((e: any) => {
      if (!e) return false;
      return (
        (callerUidNorm &&
          (normalizeEmpId(e.id) === callerUidNorm ||
            normalizeEmpId(e.ecode) === callerUidNorm)) ||
        (callerEmailLower && (e.email || '').trim().toLowerCase() === callerEmailLower)
      );
    });

    // 3. Admin: Can view all employees' regularization and leave requests
    if (
      callerUidNorm === 'EMP-001' ||
      callerEmailLower === 'grattitudesynergyllp@gmail.com' ||
      viewerEmp?.role === 'Admin'
    ) {
      return true;
    }

    const sanitized = retrofitRequestDoc(docData, employeesMap);
    const reqEmpNorm = normalizeEmpId(sanitized.employeeId);
    const reqMgrNorm = normalizeEmpId(sanitized.reportingManagerId);
    const viewerIdNorm = viewerEmp ? normalizeEmpId(viewerEmp.id) : callerUidNorm;
    const viewerEcodeNorm = viewerEmp ? normalizeEmpId(viewerEmp.ecode) : callerUidNorm;

    // 1. Employee: Can view only their own regularization and leave requests
    if (
      reqEmpNorm &&
      (reqEmpNorm === viewerIdNorm ||
        reqEmpNorm === viewerEcodeNorm ||
        reqEmpNorm === callerUidNorm)
    ) {
      return true;
    }

    // 2. Reporting Manager: Can view requests submitted by employees reporting to them
    if (
      reqMgrNorm &&
      (reqMgrNorm === viewerIdNorm ||
        reqMgrNorm === viewerEcodeNorm ||
        reqMgrNorm === callerUidNorm)
    ) {
      return true;
    }

    return false;
  };

  const scopeStateForCaller = (
    state: CentralDatabaseState,
    callerUid: string,
    callerEmail: string
  ): CentralDatabaseState => {
    if (!callerUid && !callerEmail) {
      return {
        ...state,
        collections: {
          ...state.collections,
          showup_leave_requests: {},
          showup_regularizations: {},
        },
      };
    }
    const employeesMap = state.collections?.employees || {};
    const scopedCollections = { ...state.collections };

    for (const colName of rlsProtectedCollections) {
      const rawCol = state.collections?.[colName] || {};
      const filteredCol: Record<string, any> = {};
      for (const [docId, docData] of Object.entries(rawCol)) {
        if (canCallerViewRequest(docData, callerUid, callerEmail, employeesMap)) {
          filteredCol[docId] = docData;
        }
      }
      scopedCollections[colName] = filteredCol;
    }

    return {
      ...state,
      collections: scopedCollections,
    };
  };

  const loadDb = (): CentralDatabaseState => {
    try {
      if (fs.existsSync(dbFilePath)) {
        const raw = fs.readFileSync(dbFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return enforceServerRequestAclMigration({
            collections: parsed.collections || {},
            authAccounts: parsed.authAccounts || {},
            deletedDocIds: parsed.deletedDocIds || {},
            updatedAt: parsed.updatedAt || new Date().toISOString(),
          });
        }
      }
    } catch (e) {
      console.error('Error reading central-cloud-db.json:', e);
    }
    return {
      collections: {},
      authAccounts: {},
      deletedDocIds: {},
      updatedAt: new Date().toISOString(),
    };
  };

  const saveDb = (state: CentralDatabaseState) => {
    try {
      enforceServerRequestAclMigration(state);
      state.updatedAt = new Date().toISOString();
      fs.writeFileSync(dbFilePath, JSON.stringify(state, null, 2), 'utf-8');
    } catch (e) {
      console.error('Error writing central-cloud-db.json:', e);
    }
  };

  const broadcastEvent = (payload: Record<string, any>) => {
    const message = `data: ${JSON.stringify(payload)}\n\n`;
    sseClients.forEach((client) => {
      try {
        client.write(message);
      } catch {
        sseClients.delete(client);
      }
    });
  };

  const readJsonBody = (req: IncomingMessage): Promise<any> => {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (err) {
          reject(err);
        }
      });
      req.on('error', reject);
    });
  };

  const attachMiddleware = (middlewares: any) => {
    middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
      const url = req.url || '';
      if (!url.startsWith('/api/central-db')) {
        return next();
      }

      // CORS headers for LAN / cross-device access
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, X-GS-Session-Uid, X-GS-Session-Email'
      );

      const callerUid = String(req.headers['x-gs-session-uid'] || '');
      const callerEmail = String(req.headers['x-gs-session-email'] || '');

      if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
      }

      // 1. Server-Sent Events (SSE) Real-Time Stream
      if (url.startsWith('/api/central-db/stream') && req.method === 'GET') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        });
        res.write(`data: ${JSON.stringify({ type: 'CONNECTED', state: loadDb() })}\n\n`);
        sseClients.add(res);
        req.on('close', () => {
          sseClients.delete(res);
        });
        return;
      }

      // 2. Full State Fetch & Client-to-Server Merge
      if (url.startsWith('/api/central-db/state') && req.method === 'GET') {
        const state = scopeStateForCaller(loadDb(), callerUid, callerEmail);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(state));
        return;
      }

      // 3. Merge Local Browser Records into Central DB (Preserves existing employee records)
      if (url.startsWith('/api/central-db/merge') && req.method === 'POST') {
        try {
          const body = await readJsonBody(req);
          const state = loadDb();
          const incomingCollections = body.collections || {};
          const incomingAccounts = body.authAccounts || {};
          const incomingDeleted = body.deletedDocIds || {};
          const updatedCollections: string[] = [];

          state.deletedDocIds = { ...(state.deletedDocIds || {}), ...incomingDeleted };

          for (const [colName, docsMap] of Object.entries(incomingCollections)) {
            if (!state.collections[colName]) {
              state.collections[colName] = {};
            }
            for (const [docId, docData] of Object.entries(docsMap as Record<string, any>)) {
              if (state.deletedDocIds[`${colName}:${docId}`]) continue;
              const existingDoc = state.collections[colName][docId];
              if (
                !existingDoc ||
                (existingDoc.isCloudRecovered && !docData.isCloudRecovered) ||
                (docData.updatedAt &&
                  (!existingDoc.updatedAt || docData.updatedAt > existingDoc.updatedAt))
              ) {
                state.collections[colName][docId] = docData;
                if (!updatedCollections.includes(colName)) {
                  updatedCollections.push(colName);
                }
              }
            }
          }

          for (const [emailKey, accData] of Object.entries(incomingAccounts as Record<string, any>)) {
            const existingAcc = state.authAccounts[emailKey];
            if (
              !existingAcc ||
              (existingAcc.passwordHash === '__AUTO_BIND_ON_FIRST_LOGIN__' &&
                accData?.passwordHash &&
                accData.passwordHash !== '__AUTO_BIND_ON_FIRST_LOGIN__')
            ) {
              state.authAccounts[emailKey] = accData;
            }
          }

          saveDb(state);
          if (updatedCollections.length > 0 || Object.keys(incomingAccounts).length > 0) {
            broadcastEvent({
              type: 'FULL_SYNC',
              state,
            });
          }

          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(scopeStateForCaller(state, callerUid, callerEmail)));
        } catch (err: any) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: err?.message }));
        }
        return;
      }

      // 4. Document Upsert / Update / Delete
      if (url.startsWith('/api/central-db/doc') && req.method === 'POST') {
        try {
          const body = await readJsonBody(req);
          const { action, collectionName, docId, data } = body;
          const state = loadDb();

          if (!state.collections[collectionName]) {
            state.collections[collectionName] = {};
          }

          if (action === 'set') {
            if (state.deletedDocIds) {
              delete state.deletedDocIds[`${collectionName}:${docId}`];
            }
            state.collections[collectionName][docId] = { ...data, id: docId };
          } else if (action === 'update') {
            const existing = state.collections[collectionName][docId] || { id: docId };
            state.collections[collectionName][docId] = {
              ...existing,
              ...data,
              id: docId,
            };
          } else if (action === 'delete') {
            state.deletedDocIds = state.deletedDocIds || {};
            state.deletedDocIds[`${collectionName}:${docId}`] = true;
            delete state.collections[collectionName][docId];
          }

          saveDb(state);
          broadcastEvent({
            type: 'COLLECTION_UPDATED',
            collectionName,
            collectionData: state.collections[collectionName],
          });

          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true }));
        } catch (err: any) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: err?.message }));
        }
        return;
      }

      // 5. Auth Account Upsert / Password Update
      if (url.startsWith('/api/central-db/auth') && req.method === 'POST') {
        try {
          const body = await readJsonBody(req);
          const { emailKey, account } = body;
          const state = loadDb();
          if (emailKey && account) {
            state.authAccounts[emailKey.toLowerCase()] = account;
            saveDb(state);
            broadcastEvent({
              type: 'AUTH_ACCOUNTS_UPDATED',
              authAccounts: state.authAccounts,
            });
          }
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, authAccounts: state.authAccounts }));
        } catch (err: any) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: err?.message }));
        }
        return;
      }

      next();
    });
  };

  return {
    name: 'central-cloud-db-sync',
    configureServer(server) {
      attachMiddleware(server.middlewares);
    },
    configurePreviewServer(server) {
      attachMiddleware(server.middlewares);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), createCentralDatabaseSyncPlugin()],
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
});
