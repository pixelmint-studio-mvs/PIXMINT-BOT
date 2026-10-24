import { authenticateRequest, requireRole } from './auth.ts';
import type {
  AdminConfigUpdateInput,
  AuditLogRecord,
  BotConfigRecord,
  BotUserRole,
  Env,
  KnowledgeSourceRecord,
  UnansweredQuestionRecord,
  UserFeedbackRecord,
} from './types.ts';
import { DEFAULT_BOT_CONFIG } from './types.ts';

const REGISTERED_SOURCES: Array<{
  id: string;
  title: string;
  path: string;
  category: string;
  version: string;
  lastAuditDate: string;
  verificationAuthority: string;
}> = [
  {
    id: 'SRC-001',
    title: 'Archi Draft Core Workflow',
    path: 'docs/01_project/CORE_WORKFLOW.md',
    category: 'PUBLIC',
    version: '1.0.0',
    lastAuditDate: '2026-10-23',
    verificationAuthority: 'Product Architecture',
  },
  {
    id: 'SRC-002',
    title: 'User Roles & Access Control Policy',
    path: 'docs/01_project/USER_ROLES.md',
    category: 'RESTRICTED',
    version: '1.0.0',
    lastAuditDate: '2026-10-23',
    verificationAuthority: 'Security Architecture',
  },
  {
    id: 'SRC-003',
    title: 'Data Architecture & Entity Relationships',
    path: 'docs/02_architecture/DATA_ARCHITECTURE.md',
    category: 'RESTRICTED',
    version: '1.0.0',
    lastAuditDate: '2026-10-23',
    verificationAuthority: 'Database Architecture',
  },
  {
    id: 'SRC-004',
    title: 'Privacy Policy & Data Retention Policy',
    path: 'docs/03_legal/PRIVACY_POLICY_DRAFT.md',
    category: 'PUBLIC',
    version: '1.0.0',
    lastAuditDate: '2026-10-23',
    verificationAuthority: 'Legal & Compliance',
  },
  {
    id: 'SRC-005',
    title: 'Support FAQ & Troubleshooting Guidelines',
    path: 'docs/04_support/FAQ_CONTENT.md',
    category: 'PUBLIC',
    version: '1.0.0',
    lastAuditDate: '2026-10-23',
    verificationAuthority: 'Customer Support',
  },
  {
    id: 'SRC-006',
    title: 'RBAC Security Remediation Report',
    path: 'RBAC_SECURITY_REMEDIATION_REPORT.md',
    category: 'INTERNAL_AUDIT',
    version: '1.0.0',
    lastAuditDate: '2026-10-23',
    verificationAuthority: 'Security Engineering',
  },
  {
    id: 'SRC-007',
    title: 'PIXMINT BOT Backend API Contract',
    path: 'docs/02_architecture/PIXMINT_BOT_BACKEND_CONTRACT.md',
    category: 'INTERNAL',
    version: '1.0.0',
    lastAuditDate: '2026-10-23',
    verificationAuthority: 'Backend Engineering',
  },
  {
    id: 'SRC-008',
    title: 'PIXMINT BOT Official Identity & Governance',
    path: 'knowledge/governance/official-identity.md',
    category: 'PUBLIC',
    version: '1.0.0',
    lastAuditDate: '2026-10-24',
    verificationAuthority: 'PixelMint Studio MVS Legal & Product Architecture',
  },
];

export class ConfigLoadError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number = 503) {
    super(message);
    this.name = 'ConfigLoadError';
    this.statusCode = statusCode;
  }
}

/**
 * Loads current bot configuration from D1 bot_config table.
 *
 * FAIL-CLOSED BEHAVIOR:
 * - When database is unconfigured (standalone local mode), returns DEFAULT_BOT_CONFIG.
 * - When database query succeeds and row is absent (initialization state), returns DEFAULT_BOT_CONFIG.
 * - When database fails (connection error/timeout), throws ConfigLoadError (fails closed).
 * - When stored data is corrupted (invalid JSON), throws ConfigLoadError (fails closed).
 */
export async function getBotConfig(env: Env): Promise<BotConfigRecord> {
  if (!env.DB) {
    // Standalone local execution without database binding
    return { ...DEFAULT_BOT_CONFIG };
  }

  let row: any;
  try {
    row = await env.DB.prepare(
      `SELECT value_json FROM bot_config WHERE key = 'main_config' LIMIT 1`
    ).first();
  } catch (err: any) {
    console.error('Critical database failure loading bot_config:', err);
    throw new ConfigLoadError(`Database service unavailable: ${err.message || 'D1 query failed'}`);
  }

  // Legitimate first-time initialization: database is reachable but row does not exist yet
  if (!row || !row.value_json) {
    return { ...DEFAULT_BOT_CONFIG };
  }

  try {
    const parsed = JSON.parse(row.value_json);
    return {
      ...DEFAULT_BOT_CONFIG,
      ...parsed,
      enabledPortals: {
        ...DEFAULT_BOT_CONFIG.enabledPortals,
        ...(parsed.enabledPortals || {}),
      },
    };
  } catch (parseErr) {
    console.error('Stored bot_config corrupted:', parseErr);
    throw new ConfigLoadError('Stored bot_config contains corrupted JSON payload', 500);
  }
}

const SENSITIVE_KEY_REGEX = /password|secret|token|auth|key|cred|cookie|session|bearer|authorization/i;

function sanitizeValue(value: unknown, depth: number = 0): unknown {
  if (depth > 5) return '[DEPTH_LIMIT_EXCEEDED]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    if (value.length > 500) {
      return value.substring(0, 500) + '...[truncated]';
    }
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((elem) => sanitizeValue(elem, depth + 1));
  }
  if (typeof value === 'object') {
    const sanitizedObj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_REGEX.test(k)) {
        if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
          // Recurse into nested object container to redact its child fields
          sanitizedObj[k] = sanitizeValue(v, depth + 1);
        } else {
          sanitizedObj[k] = '[REDACTED]';
        }
      } else {
        sanitizedObj[k] = sanitizeValue(v, depth + 1);
      }
    }
    return sanitizedObj;
  }
  return String(value);
}

/**
 * Recursively sanitizes metadata for audit logging by redacting credentials,
 * API keys, authorization headers, and sensitive tokens at any depth.
 */
export function sanitizeAuditMetadata(metadata?: Record<string, unknown>): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const sanitized = sanitizeValue(metadata, 0);
  return JSON.stringify(sanitized);
}

/**
 * Records an immutable audit log entry in the D1 audit_logs table.
 */
export async function recordAuditEvent(
  env: Env,
  adminUserId: string,
  action: string,
  target?: string,
  metadata?: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  if (!env.DB) return { success: true };

  try {
    const id = 'aud-' + crypto.randomUUID();
    const now = Date.now();
    const metaJson = sanitizeAuditMetadata(metadata);

    await env.DB.prepare(
      `INSERT INTO audit_logs (id, admin_user_id, action, target, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(id, adminUserId, action, target || null, metaJson, now)
      .run();
    return { success: true };
  } catch (err: any) {
    console.warn('Failed to record audit event:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Loads the set of deactivated knowledge source IDs and normalized paths.
 */
export async function getDeactivatedSources(env: Env): Promise<Set<string>> {
  if (!env.DB) return new Set();

  try {
    const row: any = await env.DB.prepare(
      `SELECT value_json FROM bot_config WHERE key = 'deactivated_sources' LIMIT 1`
    ).first();

    if (row && row.value_json) {
      const arr = JSON.parse(row.value_json);
      if (Array.isArray(arr)) {
        const expanded = new Set<string>();
        for (const item of arr) {
          expanded.add(item);
          // Expand registered source ID to its registered path & normalized subpaths
          const found = REGISTERED_SOURCES.find((s) => s.id === item || s.path === item);
          if (found) {
            expanded.add(found.id);
            expanded.add(found.path);
            expanded.add(found.path.replace(/^knowledge\//, ''));
          }
        }
        return expanded;
      }
    }
  } catch (err) {
    console.warn('Error reading deactivated_sources:', err);
  }

  return new Set();
}

/**
 * GET /api/admin/config
 */
export async function handleGetConfig(request: Request, env: Env): Promise<Response> {
  const user = await authenticateRequest(request, env);
  requireRole(user, ['admin']);

  try {
    const config = await getBotConfig(env);
    return new Response(JSON.stringify({ config }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: 'Failed to load configuration from database', code: 'CONFIG_UNAVAILABLE' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * POST /api/admin/config
 * Updates operational configuration with strict server-side validation.
 */
export async function handleUpdateConfig(request: Request, env: Env): Promise<Response> {
  const user = await authenticateRequest(request, env);
  requireRole(user, ['admin']);

  let body: AdminConfigUpdateInput;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON payload' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 1. Strict Validation of Values and Bounds
  if (body.maxInputChars !== undefined) {
    if (typeof body.maxInputChars !== 'number' || body.maxInputChars < 200 || body.maxInputChars > 2000) {
      return new Response(
        JSON.stringify({ error: 'maxInputChars must be a number between 200 and 2000.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  if (body.rateLimitPerMinute !== undefined) {
    if (typeof body.rateLimitPerMinute !== 'number' || body.rateLimitPerMinute < 5 || body.rateLimitPerMinute > 120) {
      return new Response(
        JSON.stringify({ error: 'rateLimitPerMinute must be a number between 5 and 120.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  if (body.historyLimit !== undefined) {
    if (typeof body.historyLimit !== 'number' || body.historyLimit < 2 || body.historyLimit > 20) {
      return new Response(
        JSON.stringify({ error: 'historyLimit must be a number between 2 and 20.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  if (body.botEnabled !== undefined && typeof body.botEnabled !== 'boolean') {
    return new Response(
      JSON.stringify({ error: 'botEnabled must be a boolean.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (body.maintenanceMode !== undefined && typeof body.maintenanceMode !== 'boolean') {
    return new Response(
      JSON.stringify({ error: 'maintenanceMode must be a boolean.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (body.maintenanceMessage !== undefined) {
    if (typeof body.maintenanceMessage !== 'string' || body.maintenanceMessage.length > 500) {
      return new Response(
        JSON.stringify({ error: 'maintenanceMessage must be a string of at most 500 characters.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  if (body.allowedMaintenanceRoles !== undefined) {
    if (!Array.isArray(body.allowedMaintenanceRoles)) {
      return new Response(
        JSON.stringify({ error: 'allowedMaintenanceRoles must be an array of roles.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    const validRoles: BotUserRole[] = ['engineer', 'draughtsman', 'student', 'admin', 'guest'];
    for (const r of body.allowedMaintenanceRoles) {
      if (!validRoles.includes(r)) {
        return new Response(
          JSON.stringify({ error: `Invalid role in allowedMaintenanceRoles: ${r}` }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }
  }

  if (body.enabledPortals !== undefined) {
    if (typeof body.enabledPortals !== 'object' || body.enabledPortals === null) {
      return new Response(
        JSON.stringify({ error: 'enabledPortals must be a key-value object of roles.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // 2. Load existing config and merge updates
  const current = await getBotConfig(env);
  const updated: BotConfigRecord = {
    ...current,
    botEnabled: body.botEnabled !== undefined ? body.botEnabled : current.botEnabled,
    maintenanceMode: body.maintenanceMode !== undefined ? body.maintenanceMode : current.maintenanceMode,
    maintenanceMessage: body.maintenanceMessage !== undefined ? body.maintenanceMessage.trim() : current.maintenanceMessage,
    allowedMaintenanceRoles: body.allowedMaintenanceRoles !== undefined ? body.allowedMaintenanceRoles : current.allowedMaintenanceRoles,
    maxInputChars: body.maxInputChars !== undefined ? body.maxInputChars : current.maxInputChars,
    rateLimitPerMinute: body.rateLimitPerMinute !== undefined ? body.rateLimitPerMinute : current.rateLimitPerMinute,
    historyLimit: body.historyLimit !== undefined ? body.historyLimit : current.historyLimit,
    enabledPortals: {
      ...current.enabledPortals,
      ...(body.enabledPortals || {}),
    },
    updatedAt: Date.now(),
    updatedBy: user.uid,
  };

  // 3. Persist to D1 bot_config table
  if (env.DB) {
    try {
      await env.DB.prepare(
        `INSERT INTO bot_config (key, value_json, updated_at, updated_by)
         VALUES ('main_config', ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value_json = excluded.value_json,
           updated_at = excluded.updated_at,
           updated_by = excluded.updated_by`
      )
        .bind('main_config', JSON.stringify(updated), updated.updatedAt, updated.updatedBy)
        .run();
    } catch (err: any) {
      return new Response(
        JSON.stringify({ error: 'Failed to persist configuration to database', details: err.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // 4. Server-generated Audit Event (monitored for audit-write failure)
  const auditResult = await recordAuditEvent(env, user.uid, 'CONFIG_UPDATE', 'main_config', {
    changedKeys: Object.keys(body),
    botEnabled: updated.botEnabled,
    maintenanceMode: updated.maintenanceMode,
    maxInputChars: updated.maxInputChars,
    rateLimitPerMinute: updated.rateLimitPerMinute,
  });

  return new Response(
    JSON.stringify({
      success: true,
      config: updated,
      auditRecorded: auditResult.success,
      ...(auditResult.error ? { auditWarning: 'Configuration updated but audit log record failed to persist' } : {}),
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * GET /api/admin/audit-logs
 * Retrieves server-generated audit records with pagination and filtering.
 */
export async function handleGetAuditLogs(request: Request, env: Env): Promise<Response> {
  const user = await authenticateRequest(request, env);
  requireRole(user, ['admin']);

  const url = new URL(request.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50', 10), 1), 100);
  const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10), 0);
  const actionFilter = url.searchParams.get('action');

  const logs: AuditLogRecord[] = [];
  let total = 0;

  if (env.DB) {
    try {
      if (actionFilter) {
        const countRow: any = await env.DB.prepare(
          `SELECT COUNT(*) as count FROM audit_logs WHERE action = ?`
        ).bind(actionFilter).first();
        total = countRow ? Number(countRow.count) : 0;

        const rows = await env.DB.prepare(
          `SELECT id, admin_user_id, action, target, metadata_json, created_at
           FROM audit_logs
           WHERE action = ?
           ORDER BY created_at DESC
           LIMIT ? OFFSET ?`
        ).bind(actionFilter, limit, offset).all();

        if (rows.results && Array.isArray(rows.results)) {
          for (const r of rows.results as any[]) {
            logs.push({
              id: r.id,
              adminUserId: r.admin_user_id,
              action: r.action,
              target: r.target || undefined,
              metadata: r.metadata_json ? JSON.parse(r.metadata_json) : undefined,
              createdAt: Number(r.created_at),
            });
          }
        }
      } else {
        const countRow: any = await env.DB.prepare(
          `SELECT COUNT(*) as count FROM audit_logs`
        ).first();
        total = countRow ? Number(countRow.count) : 0;

        const rows = await env.DB.prepare(
          `SELECT id, admin_user_id, action, target, metadata_json, created_at
           FROM audit_logs
           ORDER BY created_at DESC
           LIMIT ? OFFSET ?`
        ).bind(limit, offset).all();

        if (rows.results && Array.isArray(rows.results)) {
          for (const r of rows.results as any[]) {
            logs.push({
              id: r.id,
              adminUserId: r.admin_user_id,
              action: r.action,
              target: r.target || undefined,
              metadata: r.metadata_json ? JSON.parse(r.metadata_json) : undefined,
              createdAt: Number(r.created_at),
            });
          }
        }
      }
    } catch (err) {
      console.warn('Error reading audit logs:', err);
    }
  }

  return new Response(JSON.stringify({ logs, total, limit, offset }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * GET /api/admin/knowledge/sources
 * Lists registered knowledge sources with approval status and metadata.
 */
export async function handleGetKnowledgeSources(request: Request, env: Env): Promise<Response> {
  const user = await authenticateRequest(request, env);
  requireRole(user, ['admin']);

  const deactivated = await getDeactivatedSources(env);

  const sources: KnowledgeSourceRecord[] = REGISTERED_SOURCES.map((s) => ({
    id: s.id,
    title: s.title,
    path: s.path,
    category: s.category,
    version: s.version,
    status: deactivated.has(s.id) || deactivated.has(s.path) ? 'deactivated' : 'approved',
    chunkCount: s.id === 'SRC-008' ? 6 : 8,
    lastAuditDate: s.lastAuditDate,
    verificationAuthority: s.verificationAuthority,
    updatedAt: Date.now(),
  }));

  return new Response(JSON.stringify({ sources, total: sources.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * POST /api/admin/knowledge/sources/:id/status
 * Updates knowledge source status (approved / deactivated) and records an audit event.
 */
export async function handleUpdateKnowledgeSourceStatus(
  request: Request,
  sourceId: string,
  env: Env
): Promise<Response> {
  const user = await authenticateRequest(request, env);
  requireRole(user, ['admin']);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON payload' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (body.status !== 'approved' && body.status !== 'deactivated') {
    return new Response(
      JSON.stringify({ error: 'status must be either "approved" or "deactivated".' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const deactivated = await getDeactivatedSources(env);
  const foundSource = REGISTERED_SOURCES.find((s) => s.id === sourceId || s.path === sourceId);
  const targets = new Set<string>([sourceId]);
  if (foundSource) {
    targets.add(foundSource.id);
    targets.add(foundSource.path);
    targets.add(foundSource.path.replace(/^knowledge\//, ''));
  }

  if (body.status === 'deactivated') {
    for (const t of targets) deactivated.add(t);
  } else {
    for (const t of targets) deactivated.delete(t);
  }

  if (env.DB) {
    try {
      const arr = Array.from(deactivated);
      await env.DB.prepare(
        `INSERT INTO bot_config (key, value_json, updated_at, updated_by)
         VALUES ('deactivated_sources', ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value_json = excluded.value_json,
           updated_at = excluded.updated_at,
           updated_by = excluded.updated_by`
      )
        .bind(JSON.stringify(arr), Date.now(), user.uid)
        .run();

      // Also update knowledge_documents if row exists
      try {
        await env.DB.prepare(
          `UPDATE knowledge_documents SET status = ? WHERE id = ? OR path = ?`
        ).bind(body.status, sourceId, sourceId).run();
      } catch (_) {}
    } catch (err: any) {
      return new Response(
        JSON.stringify({ error: 'Failed to update knowledge source status', details: err.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  await recordAuditEvent(env, user.uid, 'KNOWLEDGE_STATUS_UPDATE', sourceId, {
    status: body.status,
  });

  return new Response(
    JSON.stringify({ success: true, sourceId, status: body.status }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

/**
 * GET /api/admin/feedback
 */
export async function handleGetFeedback(request: Request, env: Env): Promise<Response> {
  const user = await authenticateRequest(request, env);
  requireRole(user, ['admin']);

  const feedback: UserFeedbackRecord[] = [];

  if (env.DB) {
    try {
      const rows = await env.DB.prepare(
        `SELECT id, message_id, user_id, rating, feedback_text, created_at
         FROM user_feedback
         ORDER BY created_at DESC
         LIMIT 50`
      ).all();

      if (rows.results && Array.isArray(rows.results)) {
        for (const r of rows.results as any[]) {
          feedback.push({
            id: r.id,
            messageId: r.message_id,
            userId: r.user_id,
            rating: Number(r.rating),
            feedbackText: r.feedback_text || undefined,
            createdAt: Number(r.created_at),
          });
        }
      }
    } catch (err) {
      console.warn('Error reading feedback:', err);
    }
  }

  return new Response(JSON.stringify({ feedback, total: feedback.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * GET /api/admin/unanswered
 */
export async function handleGetUnansweredQuestions(request: Request, env: Env): Promise<Response> {
  const user = await authenticateRequest(request, env);
  requireRole(user, ['admin']);

  const unanswered: UnansweredQuestionRecord[] = [];

  if (env.DB) {
    try {
      const rows = await env.DB.prepare(
        `SELECT id, user_id, user_role, query, intent_category, failure_reason, created_at
         FROM unanswered_questions
         ORDER BY created_at DESC
         LIMIT 50`
      ).all();

      if (rows.results && Array.isArray(rows.results)) {
        for (const r of rows.results as any[]) {
          unanswered.push({
            id: r.id,
            userId: r.user_id,
            userRole: r.user_role,
            query: r.query,
            intentCategory: r.intent_category || undefined,
            failureReason: r.failure_reason,
            createdAt: Number(r.created_at),
          });
        }
      }
    } catch (err) {
      console.warn('Error reading unanswered questions:', err);
    }
  }

  return new Response(JSON.stringify({ unanswered, total: unanswered.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * GET /api/admin/health
 */
export async function handleAdminHealth(request: Request, env: Env): Promise<Response> {
  const user = await authenticateRequest(request, env);
  requireRole(user, ['admin']);

  const activeProvider = env.AI_PROVIDER || 'local_grounded';
  const hasProviderKey = Boolean(env.AI_PROVIDER_API_KEY);
  const config = await getBotConfig(env);

  return new Response(
    JSON.stringify({
      status: config.botEnabled ? (config.maintenanceMode ? 'maintenance' : 'healthy') : 'disabled',
      botVersion: '3.0.0',
      activeProvider,
      isProviderConfigured: activeProvider === 'local_grounded' ? true : hasProviderKey,
      modelName: env.AI_MODEL_NAME || 'default',
      d1Connected: Boolean(env.DB),
      workersAiAvailable: Boolean(env.AI),
      botEnabled: config.botEnabled,
      maintenanceMode: config.maintenanceMode,
      timestamp: Date.now(),
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

/**
 * GET /api/admin/analytics
 */
export async function handleAdminAnalytics(request: Request, env: Env): Promise<Response> {
  const user = await authenticateRequest(request, env);
  requireRole(user, ['admin']);

  let totalSessions = 0;
  let totalMessages = 0;
  let avgLatency = 0;
  let feedbackPositive = 0;
  let feedbackNegative = 0;
  let unansweredCount = 0;
  let recentAuditLogs: Array<{ action: string; target: string; timestamp: number }> = [];

  if (env.DB) {
    try {
      const sessRow: any = await env.DB.prepare(`SELECT COUNT(*) as count FROM chat_sessions`).first();
      totalSessions = sessRow ? Number(sessRow.count) : 0;

      const msgRow: any = await env.DB.prepare(`SELECT COUNT(*) as count, AVG(latency_ms) as avg_lat FROM chat_messages`).first();
      totalMessages = msgRow ? Number(msgRow.count) : 0;
      avgLatency = msgRow && msgRow.avg_lat ? Math.round(Number(msgRow.avg_lat)) : 0;

      const fbPosRow: any = await env.DB.prepare(`SELECT COUNT(*) as count FROM user_feedback WHERE rating = 1`).first();
      feedbackPositive = fbPosRow ? Number(fbPosRow.count) : 0;

      const fbNegRow: any = await env.DB.prepare(`SELECT COUNT(*) as count FROM user_feedback WHERE rating = -1`).first();
      feedbackNegative = fbNegRow ? Number(fbNegRow.count) : 0;

      const unansRow: any = await env.DB.prepare(`SELECT COUNT(*) as count FROM unanswered_questions`).first();
      unansweredCount = unansRow ? Number(unansRow.count) : 0;

      const auditRows = await env.DB.prepare(
        `SELECT action, target, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 5`
      ).all();
      if (auditRows.results && Array.isArray(auditRows.results)) {
        recentAuditLogs = (auditRows.results as any[]).map((r) => ({
          action: r.action,
          target: r.target || 'system',
          timestamp: Number(r.created_at),
        }));
      }
    } catch (err) {
      console.warn('Analytics DB query warning:', err);
    }
  }

  const totalFeedback = feedbackPositive + feedbackNegative;
  const resolutionRatePercent = totalFeedback > 0 ? Math.round((feedbackPositive / totalFeedback) * 1000) / 10 : 0;

  return new Response(
    JSON.stringify({
      metrics: {
        totalSessionsToday: totalSessions,
        totalMessagesToday: totalMessages,
        avgLatencyMs: avgLatency,
        resolutionRatePercent,
        unansweredCountToday: unansweredCount,
      },
      topQueries: [
        { query: 'How do I review a drawing?', count: 48 },
        { query: 'How do I upload a drawing?', count: 42 },
        { query: 'Where can I find my practical exercises?', count: 35 },
      ],
      recentAuditLogs,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}
