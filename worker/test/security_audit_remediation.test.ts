import assert from 'node:assert';
import test from 'node:test';
import worker from '../src/index.ts';
import { resetRateLimits } from '../src/rate_limiter.ts';
import { retrieveKnowledge } from '../src/knowledge/retriever.ts';
import { getBotConfig, sanitizeAuditMetadata } from '../src/admin.ts';
import { authenticateRequest, resetSigningKeyCache } from '../src/auth.ts';

// Helper to base64url encode
function base64UrlEncode(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlBytes(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// In-Memory SQLite Mock for D1Database with fail simulation
class MockD1WithFailures {
  public failOnRead = false;
  public failOnWrite = false;
  public tables: Record<string, any[]> = {
    bot_config: [],
    audit_logs: [],
    knowledge_documents: [],
    unanswered_questions: [],
    user_feedback: [],
    chat_messages: [],
    chat_sessions: [],
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
        if (db.failOnRead) {
          throw new Error('D1 Read Error: Database connection timeout');
        }
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
          if (normalized.includes('CHAT_SESSIONS')) return { count: db.tables.chat_sessions.length };
          if (normalized.includes('CHAT_MESSAGES')) return { count: db.tables.chat_messages.length, avg_lat: 0 };
          if (normalized.includes('USER_FEEDBACK')) return { count: db.tables.user_feedback.length };
          if (normalized.includes('UNANSWERED_QUESTIONS')) return { count: db.tables.unanswered_questions.length };
          if (normalized.includes('AUDIT_LOGS')) return { count: db.tables.audit_logs.length };
        }
        return null;
      },
      async all() {
        if (db.failOnRead) {
          throw new Error('D1 Read Error: Database connection timeout');
        }
        const normalized = query.trim().toUpperCase();
        if (normalized.includes('FROM AUDIT_LOGS')) {
          return { results: [...db.tables.audit_logs] };
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
        if (db.failOnWrite) {
          throw new Error('D1 Write Error: Database disk quota exceeded');
        }
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
        return { success: true };
      },
    };
  }
}

test('Remediation 1: Guest IP-based rate limiting prevents quota bypass via random UIDs', async () => {
  resetRateLimits();
  const db = new MockD1WithFailures();
  db.tables.chat_sessions.push({
    id: 's1',
    user_id: 'guest',
    user_role: 'guest',
    title: 'Guest Session',
    is_archived: 0,
    created_at: Date.now(),
    updated_at: Date.now(),
  });

  // Set tight rate limit of 3 requests per minute
  db.tables.bot_config.push({
    key: 'main_config',
    value_json: JSON.stringify({ botEnabled: true, rateLimitPerMinute: 3 }),
    updated_at: Date.now(),
    updated_by: 'admin',
  });

  const guestIp = '203.0.113.42';

  // Send 3 unauthenticated requests with the same IP (each request gets a new random guest UID in auth.ts)
  for (let i = 1; i <= 3; i++) {
    const req = new Request('https://api.pixelmint.studio/api/chat/sessions/s1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'cf-connecting-ip': guestIp,
      },
      body: JSON.stringify({ content: `Guest message ${i}` }),
    });

    const res = await worker.fetch(req, { DB: db as any, AI_PROVIDER: 'local_grounded' });
    assert.strictEqual(res.status, 200, `Guest request ${i} should succeed within rate limit`);
  }

  // 4th request from the same IP must be BLOCKED with 429 despite having a new random guest UID
  const blockedReq = new Request('https://api.pixelmint.studio/api/chat/sessions/s1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'cf-connecting-ip': guestIp,
    },
    body: JSON.stringify({ content: 'Guest message 4 should be blocked' }),
  });

  const blockedRes = await worker.fetch(blockedReq, { DB: db as any, AI_PROVIDER: 'local_grounded' });
  assert.strictEqual(blockedRes.status, 429, '4th guest request from same IP must receive HTTP 429');
  const body: any = await blockedRes.json();
  assert.strictEqual(body.code, 'RATE_LIMIT_EXCEEDED');

  // A different IP address should NOT be blocked
  const differentIpReq = new Request('https://api.pixelmint.studio/api/chat/sessions/s1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'cf-connecting-ip': '198.51.100.99',
    },
    body: JSON.stringify({ content: 'Legitimate message from another IP' }),
  });
  const diffRes = await worker.fetch(differentIpReq, { DB: db as any, AI_PROVIDER: 'local_grounded' });
  assert.strictEqual(diffRes.status, 200, 'Different IP must have its own isolated rate limit bucket');
});

test('Remediation 2: Database read failure fails closed (returns 503 instead of enabling bot)', async () => {
  const db = new MockD1WithFailures();
  db.failOnRead = true; // Simulate D1 database outage

  // Verify getBotConfig throws ConfigLoadError
  await assert.rejects(
    async () => {
      await getBotConfig({ DB: db as any });
    },
    (err: any) => {
      return err.name === 'ConfigLoadError' && err.statusCode === 503;
    },
    'getBotConfig must fail closed with ConfigLoadError when database is unreachable'
  );

  // Verify chat endpoint fails closed with 503 CONFIG_UNAVAILABLE
  const chatReq = new Request('https://api.pixelmint.studio/api/chat/sessions/s1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 'Hello bot' }),
  });

  const chatRes = await worker.fetch(chatReq, { DB: db as any });
  assert.strictEqual(chatRes.status, 503, 'Chat must fail closed with 503 during database outage');
  const chatBody: any = await chatRes.json();
  assert.strictEqual(chatBody.code, 'CONFIG_UNAVAILABLE');
});

test('Remediation 3: Knowledge source deactivation excludes official-identity chunks from retrieval', async () => {
  // 1. Without deactivation, official identity is retrievable
  const initialResult = retrieveKnowledge('who created you', 'engineer', 3);
  const hasIdentityChunk = initialResult.chunks.some(
    (c) => c.path.includes('official-identity.md') || c.docId.includes('official-identity')
  );
  assert.strictEqual(hasIdentityChunk, true, 'Official identity chunks should be retrieved when source is active');

  // 2. Deactivating by source ID 'SRC-008' must exclude official-identity chunks
  const deactivatedById = retrieveKnowledge('who created you', 'engineer', 3, new Set(['SRC-008']));
  const stillHasChunk = deactivatedById.chunks.some(
    (c) => c.path.includes('official-identity.md') || c.docId.includes('official-identity')
  );
  assert.strictEqual(stillHasChunk, false, 'Deactivating SRC-008 must completely exclude official identity chunks');

  // 3. Deactivating by path fragment must also exclude
  const deactivatedByPath = retrieveKnowledge('who created you', 'engineer', 3, new Set(['knowledge/governance/official-identity.md']));
  assert.strictEqual(
    deactivatedByPath.chunks.some((c) => c.path.includes('official-identity.md')),
    false,
    'Deactivating by path must exclude chunks'
  );
});

test('Remediation 4: Recursive audit metadata sanitization redacts sensitive credentials at any depth', () => {
  const deepMetadata = {
    action: 'UPDATE_CREDENTIALS',
    adminEmail: 'admin@pixelmint.studio',
    credentials: {
      apiKey: 'sk-live-super-secret-key-9999',
      secretToken: 'jwt-refresh-token-xyz',
      nestedAuth: {
        authorizationHeader: 'Bearer token-12345',
        passwords: ['hunter2', 'supersecret'],
      },
    },
    normalConfig: {
      maxChars: 1200,
      enabled: true,
      tags: ['production', 'release-2.0'],
    },
  };

  const sanitizedJson = sanitizeAuditMetadata(deepMetadata);
  assert.ok(sanitizedJson, 'Sanitized metadata must not be null');

  const parsed = JSON.parse(sanitizedJson);

  // Non-sensitive fields preserved
  assert.strictEqual(parsed.adminEmail, 'admin@pixelmint.studio');
  assert.strictEqual(parsed.normalConfig.maxChars, 1200);
  assert.strictEqual(parsed.normalConfig.enabled, true);
  assert.deepStrictEqual(parsed.normalConfig.tags, ['production', 'release-2.0']);

  // Deeply nested sensitive fields redacted
  assert.strictEqual(parsed.credentials.apiKey, '[REDACTED]');
  assert.strictEqual(parsed.credentials.secretToken, '[REDACTED]');
  assert.strictEqual(parsed.credentials.nestedAuth.authorizationHeader, '[REDACTED]');
  assert.strictEqual(parsed.credentials.nestedAuth.passwords, '[REDACTED]');

  // Verify plaintext secrets are never present in raw JSON string
  assert.strictEqual(sanitizedJson.includes('sk-live-super-secret-key-9999'), false);
  assert.strictEqual(sanitizedJson.includes('jwt-refresh-token-xyz'), false);
  assert.strictEqual(sanitizedJson.includes('hunter2'), false);
});

test('Remediation 5: Genuine Web Crypto RSA-256 token verification passes valid signatures and rejects tampering', async () => {
  resetSigningKeyCache();

  // 1. Generate an authentic 2048-bit RSA key pair using native Web Crypto
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify']
  );

  const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  publicJwk.kid = 'test-key-id-001';

  // 2. Craft and sign an authentic RS256 token
  const header = { alg: 'RS256', kid: 'test-key-id-001', typ: 'JWT' };
  const payload = {
    sub: 'verified-engineer-101',
    role: 'engineer',
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  const headerEncoded = base64UrlEncode(JSON.stringify(header));
  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
  const unsignedData = new TextEncoder().encode(`${headerEncoded}.${payloadEncoded}`);

  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    keyPair.privateKey,
    unsignedData
  );
  const signatureEncoded = base64UrlBytes(new Uint8Array(signatureBuffer));

  const validToken = `${headerEncoded}.${payloadEncoded}.${signatureEncoded}`;

  const testEnv = {
    ENVIRONMENT: 'production', // Enforce production cryptographic checks
    TEST_PUBLIC_JWK: publicJwk,
  };

  // 3. Authentic token verification must succeed
  const validReq = new Request('https://api.pixelmint.studio/api/test', {
    headers: { Authorization: `Bearer ${validToken}` },
  });
  const verifiedUser = await authenticateRequest(validReq, testEnv);
  assert.strictEqual(verifiedUser.uid, 'verified-engineer-101');
  assert.strictEqual(verifiedUser.role, 'engineer');

  // 4. Tampered payload (privilege escalation: attacker attempts to change role to admin)
  const tamperedPayload = {
    ...payload,
    role: 'admin',
  };
  const tamperedPayloadEncoded = base64UrlEncode(JSON.stringify(tamperedPayload));
  // Note: attacker keeps original signature from the engineer token
  const forgedToken = `${headerEncoded}.${tamperedPayloadEncoded}.${signatureEncoded}`;

  const forgedReq = new Request('https://api.pixelmint.studio/api/test', {
    headers: { Authorization: `Bearer ${forgedToken}` },
  });
  await assert.rejects(
    async () => {
      await authenticateRequest(forgedReq, testEnv);
    },
    (err: any) => {
      return err.statusCode === 401 && err.message.includes('Cryptographic signature verification failed');
    },
    'Tampered token payload must fail cryptographic signature verification'
  );

  // 5. In production mode, unsigned 'none' algorithm must be rejected
  const noneHeader = base64UrlEncode(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const unsignedToken = `${noneHeader}.${payloadEncoded}.`;
  const unsignedReq = new Request('https://api.pixelmint.studio/api/test', {
    headers: { Authorization: `Bearer ${unsignedToken}` },
  });
  await assert.rejects(
    async () => {
      await authenticateRequest(unsignedReq, { ENVIRONMENT: 'production' });
    },
    (err: any) => {
      return err.statusCode === 401 && err.message.includes('Insecure JWT algorithm');
    },
    'Unsigned alg: none tokens must be strictly rejected in production'
  );

  // 6. In staging mode, unsigned 'none' algorithm must also be strictly rejected
  await assert.rejects(
    async () => {
      await authenticateRequest(unsignedReq, { ENVIRONMENT: 'staging' });
    },
    (err: any) => {
      return err.statusCode === 401 && err.message.includes('Insecure JWT algorithm');
    },
    'Unsigned alg: none tokens must be strictly rejected in staging'
  );

  // 7. Expired token rejection
  const expiredPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) - 120, // Expired 2 minutes ago
  };
  const expiredPayloadEncoded = base64UrlEncode(JSON.stringify(expiredPayload));
  const expiredSigBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    keyPair.privateKey,
    new TextEncoder().encode(`${headerEncoded}.${expiredPayloadEncoded}`)
  );
  const expiredToken = `${headerEncoded}.${expiredPayloadEncoded}.${base64UrlBytes(new Uint8Array(expiredSigBuffer))}`;
  const expiredReq = new Request('https://api.pixelmint.studio/api/test', {
    headers: { Authorization: `Bearer ${expiredToken}` },
  });
  await assert.rejects(
    async () => {
      await authenticateRequest(expiredReq, testEnv);
    },
    (err: any) => {
      return err.statusCode === 401 && err.message.includes('expired');
    },
    'Expired tokens must be rejected with 401'
  );

  // 8. Audience & Issuer verification against configured FIREBASE_PROJECT_ID
  const projectMismatchEnv = {
    ...testEnv,
    FIREBASE_PROJECT_ID: 'archidraft-prod-101',
  };
  await assert.rejects(
    async () => {
      await authenticateRequest(validReq, projectMismatchEnv);
    },
    (err: any) => {
      return err.statusCode === 401 && (err.message.includes('audience') || err.message.includes('issuer'));
    },
    'Tokens without matching FIREBASE_PROJECT_ID must be rejected'
  );
});

test('Remediation 6: Truthful analytics reports actual 0 counts without fake non-zero defaults', async () => {
  const db = new MockD1WithFailures();
  // Ensure tables are completely empty (0 sessions, 0 messages, 0 feedback)

  const adminToken = base64UrlEncode(JSON.stringify({ alg: 'none', typ: 'JWT' })) + '.' +
    base64UrlEncode(JSON.stringify({ uid: 'admin-01', role: 'admin', exp: Math.floor(Date.now() / 1000) + 3600 })) + '.';

  const req = new Request('https://api.pixelmint.studio/api/admin/analytics', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });

  const res = await worker.fetch(req, { DB: db as any, ENVIRONMENT: 'test' });
  assert.strictEqual(res.status, 200);
  const data: any = await res.json();

  // Must report honest 0 counts when database is empty
  assert.strictEqual(data.metrics.totalSessionsToday, 0, 'Total sessions must be 0, not fake 142');
  assert.strictEqual(data.metrics.totalMessagesToday, 0, 'Total messages must be 0, not fake 894');
  assert.strictEqual(data.metrics.avgLatencyMs, 0, 'Average latency must be 0, not fake 142 ms');
  assert.strictEqual(data.metrics.resolutionRatePercent, 0, 'Resolution rate must be 0% when no feedback exists');
});
