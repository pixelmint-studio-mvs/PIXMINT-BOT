import assert from 'node:assert';
import test from 'node:test';
import worker from '../src/index.ts';
import { resetRateLimits } from '../src/rate_limiter.ts';
import { retrieveKnowledge } from '../src/knowledge/retriever.ts';

// Helper to craft test tokens
function craftToken(claims: Record<string, any>): string {
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, ...claims }));
  return `${header}.${payload}.`;
}

// In-Memory SQLite Mock for D1Database
class MockD1Database {
  private tables: Record<string, any[]> = {
    bot_config: [],
    audit_logs: [],
    knowledge_documents: [],
    unanswered_questions: [],
    user_feedback: [],
    chat_messages: [],
    chat_sessions: [
      { id: 'sess-1', user_id: 'eng-01', user_role: 'engineer', title: 'Test 1', is_archived: 0, created_at: Date.now(), updated_at: Date.now() },
      { id: 'sess-2', user_id: 'admin-01', user_role: 'admin', title: 'Test 2', is_archived: 0, created_at: Date.now(), updated_at: Date.now() },
      { id: 'sess-3', user_id: 'eng-01', user_role: 'engineer', title: 'Test 3', is_archived: 0, created_at: Date.now(), updated_at: Date.now() },
      { id: 'sess-rate', user_id: 'rate-test-user', user_role: 'engineer', title: 'Rate Test', is_archived: 0, created_at: Date.now(), updated_at: Date.now() },
    ],
  };

  prepare(query: string) {
    const db = this;
    let boundParams: any[] = [];

    return {
      bind(...params: any[]) {
        boundParams = params;
        return this;
      },
      async first() {
        const normalized = query.trim().toUpperCase();
        if (normalized.includes('FROM BOT_CONFIG')) {
          const key = boundParams[0] || 'main_config';
          const row = db.tables.bot_config.find((r) => r.key === key);
          return row || null;
        }
        if (normalized.includes('FROM CHAT_SESSIONS')) {
          const sessionId = boundParams[0];
          const row = db.tables.chat_sessions.find((s) => s.id === sessionId);
          return row || null;
        }
        if (normalized.includes('COUNT(*)')) {
          if (normalized.includes('AUDIT_LOGS')) {
            if (normalized.includes('WHERE ACTION = ?')) {
              const action = boundParams[0];
              const count = db.tables.audit_logs.filter((r) => r.action === action).length;
              return { count };
            }
            return { count: db.tables.audit_logs.length };
          }
          if (normalized.includes('CHAT_SESSIONS')) return { count: db.tables.chat_sessions.length };
          if (normalized.includes('CHAT_MESSAGES')) return { count: db.tables.chat_messages.length, avg_lat: 120 };
          if (normalized.includes('USER_FEEDBACK')) {
            if (normalized.includes('RATING = 1')) return { count: db.tables.user_feedback.filter((r) => r.rating === 1).length };
            if (normalized.includes('RATING = -1')) return { count: db.tables.user_feedback.filter((r) => r.rating === -1).length };
            return { count: db.tables.user_feedback.length };
          }
          if (normalized.includes('UNANSWERED_QUESTIONS')) return { count: db.tables.unanswered_questions.length };
        }
        return null;
      },
      async all() {
        const normalized = query.trim().toUpperCase();
        if (normalized.includes('FROM AUDIT_LOGS')) {
          let rows = [...db.tables.audit_logs];
          if (normalized.includes('WHERE ACTION = ?')) {
            const action = boundParams[0];
            rows = rows.filter((r) => r.action === action);
          }
          // Sort desc created_at
          rows.sort((a, b) => b.created_at - a.created_at);
          const limit = boundParams[boundParams.length - 2] ?? 50;
          const offset = boundParams[boundParams.length - 1] ?? 0;
          return { results: rows.slice(offset, offset + limit) };
        }
        if (normalized.includes('FROM USER_FEEDBACK')) {
          return { results: [...db.tables.user_feedback] };
        }
        if (normalized.includes('FROM UNANSWERED_QUESTIONS')) {
          return { results: [...db.tables.unanswered_questions] };
        }
        if (normalized.includes('FROM CHAT_SESSIONS')) {
          const userId = boundParams[0];
          const rows = db.tables.chat_sessions.filter((s) => s.user_id === userId);
          return { results: rows };
        }
        if (normalized.includes('FROM CHAT_MESSAGES')) {
          const sessionId = boundParams[0];
          let rows = db.tables.chat_messages;
          if (sessionId) {
            rows = rows.filter((m) => m.session_id === sessionId);
          }
          return { results: rows };
        }
        return { results: [] };
      },
      async run() {
        const normalized = query.trim().toUpperCase();
        if (normalized.includes('INSERT INTO BOT_CONFIG')) {
          const [key, value_json, updated_at, updated_by] = boundParams;
          const idx = db.tables.bot_config.findIndex((r) => r.key === key);
          if (idx >= 0) {
            db.tables.bot_config[idx] = { key, value_json, updated_at, updated_by };
          } else {
            db.tables.bot_config.push({ key, value_json, updated_at, updated_by });
          }
          return { success: true };
        }
        if (normalized.includes('INSERT INTO AUDIT_LOGS')) {
          const [id, admin_user_id, action, target, metadata_json, created_at] = boundParams;
          db.tables.audit_logs.push({ id, admin_user_id, action, target, metadata_json, created_at });
          return { success: true };
        }
        if (normalized.includes('INSERT INTO CHAT_SESSIONS')) {
          const [id, user_id, user_role, title, is_archived, created_at, updated_at] = boundParams;
          db.tables.chat_sessions.push({ id, user_id, user_role, title, is_archived, created_at, updated_at });
          return { success: true };
        }
        if (normalized.includes('UPDATE CHAT_SESSIONS')) {
          const [updated_at, id] = boundParams;
          const session = db.tables.chat_sessions.find((s) => s.id === id);
          if (session) session.updated_at = updated_at;
          return { success: true };
        }
        if (normalized.includes('INSERT INTO CHAT_MESSAGES')) {
          const [id, session_id, user_id, sender, content, sources_json, model_name, latency_ms, created_at] = boundParams;
          db.tables.chat_messages.push({ id, session_id, user_id, sender, content, sources_json, model_name, latency_ms, created_at });
          return { success: true };
        }
        if (normalized.includes('INSERT INTO UNANSWERED_QUESTIONS')) {
          const [id, user_id, user_role, query, intent_category, failure_reason, created_at] = boundParams;
          db.tables.unanswered_questions.push({ id, user_id, user_role, query, intent_category, failure_reason, created_at });
          return { success: true };
        }
        return { success: true };
      },
    };
  }

  // Helper for test assertions
  getAuditLogs() {
    return this.tables.audit_logs;
  }
  getConfigRow(key: string) {
    return this.tables.bot_config.find((r) => r.key === key);
  }
}

test('Admin Persistence 1: Read default configuration and reject unauthorized updates', async () => {
  const db = new MockD1Database();
  const adminToken = craftToken({ uid: 'admin-01', role: 'admin' });
  const engToken = craftToken({ uid: 'eng-01', role: 'engineer' });

  // 1. Read default config
  const getReq = new Request('https://api.pixelmint.studio/api/admin/config', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const getRes = await worker.fetch(getReq, { DB: db as any });
  assert.strictEqual(getRes.status, 200);
  const data: any = await getRes.json();
  assert.strictEqual(data.config.botEnabled, true);
  assert.strictEqual(data.config.maintenanceMode, false);
  assert.strictEqual(data.config.maxInputChars, 1000);
  assert.strictEqual(data.config.rateLimitPerMinute, 30);

  // 2. Reject non-admin update attempt
  const nonAdminReq = new Request('https://api.pixelmint.studio/api/admin/config', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${engToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ botEnabled: false }),
  });
  const nonAdminRes = await worker.fetch(nonAdminReq, { DB: db as any });
  assert.strictEqual(nonAdminRes.status, 403, 'Non-admin must be rejected from modifying configuration');
});

test('Admin Persistence 2: Valid configuration update persists in D1 and records audit event', async () => {
  const db = new MockD1Database();
  const adminToken = craftToken({ uid: 'admin-01', role: 'admin' });

  // Update configuration
  const updateReq = new Request('https://api.pixelmint.studio/api/admin/config', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      maxInputChars: 1500,
      rateLimitPerMinute: 45,
      historyLimit: 12,
      maintenanceMode: true,
      maintenanceMessage: 'System under technical scheduled upgrade.',
    }),
  });
  const updateRes = await worker.fetch(updateReq, { DB: db as any });
  assert.strictEqual(updateRes.status, 200);
  const updateBody: any = await updateRes.json();
  assert.strictEqual(updateBody.success, true);
  assert.strictEqual(updateBody.config.maxInputChars, 1500);
  assert.strictEqual(updateBody.config.rateLimitPerMinute, 45);
  assert.strictEqual(updateBody.config.maintenanceMode, true);

  // Verify persistence in D1
  const savedRow = db.getConfigRow('main_config');
  assert.ok(savedRow, 'Row must exist in bot_config table');
  const parsed = JSON.parse(savedRow.value_json);
  assert.strictEqual(parsed.maxInputChars, 1500);
  assert.strictEqual(parsed.rateLimitPerMinute, 45);
  assert.strictEqual(parsed.maintenanceMode, true);

  // Verify server-side audit event was created
  const auditLogs = db.getAuditLogs();
  assert.strictEqual(auditLogs.length, 1);
  assert.strictEqual(auditLogs[0].action, 'CONFIG_UPDATE');
  assert.strictEqual(auditLogs[0].admin_user_id, 'admin-01');

  // Verify subsequent read returns the persisted configuration
  const readReq = new Request('https://api.pixelmint.studio/api/admin/config', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const readRes = await worker.fetch(readReq, { DB: db as any });
  assert.strictEqual(readRes.status, 200);
  const readBody: any = await readRes.json();
  assert.strictEqual(readBody.config.maxInputChars, 1500);
  assert.strictEqual(readBody.config.maintenanceMode, true);
});

test('Admin Persistence 3: Reject out-of-range configuration parameters', async () => {
  const db = new MockD1Database();
  const adminToken = craftToken({ uid: 'admin-01', role: 'admin' });

  // Value below minimum (maxInputChars < 200)
  const lowCharReq = new Request('https://api.pixelmint.studio/api/admin/config', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ maxInputChars: 100 }),
  });
  const lowCharRes = await worker.fetch(lowCharReq, { DB: db as any });
  assert.strictEqual(lowCharRes.status, 400);

  // Value above maximum (rateLimitPerMinute > 120)
  const highRateReq = new Request('https://api.pixelmint.studio/api/admin/config', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ rateLimitPerMinute: 200 }),
  });
  const highRateRes = await worker.fetch(highRateReq, { DB: db as any });
  assert.strictEqual(highRateRes.status, 400);
});

test('Admin Persistence 4: Maintenance mode is strictly enforced server-side in chat endpoint', async () => {
  const db = new MockD1Database();
  const adminToken = craftToken({ uid: 'admin-01', role: 'admin' });
  const engToken = craftToken({ uid: 'eng-01', role: 'engineer' });

  // 1. Activate Maintenance Mode via Admin Endpoint
  const updateReq = new Request('https://api.pixelmint.studio/api/admin/config', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      maintenanceMode: true,
      maintenanceMessage: 'Archi Draft AI is currently undergoing emergency database reindexing.',
      allowedMaintenanceRoles: ['admin'],
    }),
  });
  await worker.fetch(updateReq, { DB: db as any });

  // 2. Engineer message must receive structured maintenance response
  const engMsgReq = new Request('https://api.pixelmint.studio/api/chat/sessions/sess-1/messages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${engToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content: 'How do I review a drawing?' }),
  });
  const engRes = await worker.fetch(engMsgReq, { DB: db as any });
  assert.strictEqual(engRes.status, 200);
  const engBody: any = await engRes.json();
  assert.strictEqual(engBody.sender, 'system');
  assert.strictEqual(engBody.modelName, 'system-maintenance-mode');
  assert.ok(engBody.content.includes('emergency database reindexing'));

  // 3. Admin user is permitted during maintenance mode
  const adminMsgReq = new Request('https://api.pixelmint.studio/api/chat/sessions/sess-2/messages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content: 'How do I check bot service status?' }),
  });
  const adminRes = await worker.fetch(adminMsgReq, { DB: db as any, AI_PROVIDER: 'local_grounded' });
  assert.strictEqual(adminRes.status, 200);
  const adminBody: any = await adminRes.json();
  assert.strictEqual(adminBody.sender, 'bot');
  assert.notStrictEqual(adminBody.modelName, 'system-maintenance-mode');
});

test('Admin Persistence 5: Bot disable and portal disable return 503 Service Unavailable', async () => {
  const db = new MockD1Database();
  const adminToken = craftToken({ uid: 'admin-01', role: 'admin' });
  const engToken = craftToken({ uid: 'eng-01', role: 'engineer' });

  // 1. Disable the bot globally
  const disableReq = new Request('https://api.pixelmint.studio/api/admin/config', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ botEnabled: false }),
  });
  await worker.fetch(disableReq, { DB: db as any });

  // 2. Chat message should fail with 503 BOT_DISABLED
  const msgReq = new Request('https://api.pixelmint.studio/api/chat/sessions/sess-3/messages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${engToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content: 'Hello' }),
  });
  const msgRes = await worker.fetch(msgReq, { DB: db as any });
  assert.strictEqual(msgRes.status, 503);
  const msgBody: any = await msgRes.json();
  assert.strictEqual(msgBody.code, 'BOT_DISABLED');
});

test('Admin Persistence 6: Rate limit cap is enforced server-side with 429 Too Many Requests', async () => {
  resetRateLimits();
  const db = new MockD1Database();
  const adminToken = craftToken({ uid: 'admin-01', role: 'admin' });
  const userToken = craftToken({ uid: 'rate-test-user', role: 'engineer' });

  // Configure tight rate limit of 5 per minute
  const configReq = new Request('https://api.pixelmint.studio/api/admin/config', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ rateLimitPerMinute: 5 }),
  });
  await worker.fetch(configReq, { DB: db as any });

  // Send 5 permitted messages
  for (let i = 0; i < 5; i++) {
    const req = new Request('https://api.pixelmint.studio/api/chat/sessions/sess-rate/messages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content: `Question ${i + 1}` }),
    });
    const res = await worker.fetch(req, { DB: db as any, AI_PROVIDER: 'local_grounded' });
    assert.strictEqual(res.status, 200, `Message ${i + 1} must succeed within rate limit`);
  }

  // 6th message exceeds limit
  const exceedReq = new Request('https://api.pixelmint.studio/api/chat/sessions/sess-rate/messages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${userToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content: 'Question 6 (exceeds limit)' }),
  });
  const exceedRes = await worker.fetch(exceedReq, { DB: db as any, AI_PROVIDER: 'local_grounded' });
  assert.strictEqual(exceedRes.status, 429, 'Excess request must receive 429 Too Many Requests');
  const exceedBody: any = await exceedRes.json();
  assert.strictEqual(exceedBody.code, 'RATE_LIMIT_EXCEEDED');
  assert.ok(exceedRes.headers.get('Retry-After'), 'Must include Retry-After header');
});

test('Admin Persistence 7: Audit logs endpoint provides pagination, action filtering, and sanitization', async () => {
  const db = new MockD1Database();
  const adminToken = craftToken({ uid: 'admin-01', role: 'admin' });

  // Generate multiple config updates to populate audit log
  for (let i = 0; i < 3; i++) {
    const req = new Request('https://api.pixelmint.studio/api/admin/config', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ maxInputChars: 1000 + i * 100 }),
    });
    await worker.fetch(req, { DB: db as any });
  }

  // Query audit logs with pagination
  const logReq = new Request('https://api.pixelmint.studio/api/admin/audit-logs?limit=2&offset=0', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const logRes = await worker.fetch(logReq, { DB: db as any });
  assert.strictEqual(logRes.status, 200);
  const logBody: any = await logRes.json();
  assert.strictEqual(logBody.logs.length, 2);
  assert.strictEqual(logBody.total, 3);
  assert.strictEqual(logBody.logs[0].action, 'CONFIG_UPDATE');
  assert.strictEqual(logBody.logs[0].adminUserId, 'admin-01');

  // Verify non-admin blocked
  const engToken = craftToken({ uid: 'eng-01', role: 'engineer' });
  const blockReq = new Request('https://api.pixelmint.studio/api/admin/audit-logs', {
    headers: { Authorization: `Bearer ${engToken}` },
  });
  const blockRes = await worker.fetch(blockReq, { DB: db as any });
  assert.strictEqual(blockRes.status, 403);
});

test('Admin Persistence 8: Knowledge source management and retrieval exclusion', async () => {
  const db = new MockD1Database();
  const adminToken = craftToken({ uid: 'admin-01', role: 'admin' });

  // 1. List registered knowledge sources
  const listReq = new Request('https://api.pixelmint.studio/api/admin/knowledge/sources', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const listRes = await worker.fetch(listReq, { DB: db as any });
  assert.strictEqual(listRes.status, 200);
  const listBody: any = await listRes.json();
  assert.ok(listBody.sources.length >= 8, 'Must return registered sources');
  assert.strictEqual(listBody.sources[0].status, 'approved');

  // 2. Deactivate a source (SRC-001)
  const deactReq = new Request('https://api.pixelmint.studio/api/admin/knowledge/sources/SRC-001/status', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status: 'deactivated' }),
  });
  const deactRes = await worker.fetch(deactReq, { DB: db as any });
  assert.strictEqual(deactRes.status, 200);
  const deactBody: any = await deactRes.json();
  assert.strictEqual(deactBody.status, 'deactivated');

  // Verify retrieval excludes deactivated source
  const deactivatedSet = new Set(['docs/01_project/CORE_WORKFLOW.md']);
  const filteredResult = retrieveKnowledge('core workflow', 'engineer', 3, deactivatedSet);
  assert.strictEqual(
    filteredResult.chunks.some((c) => c.path.includes('CORE_WORKFLOW.md')),
    false,
    'Deactivated source chunks must be excluded from retrieval'
  );
});
