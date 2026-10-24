import { authenticateRequest } from './auth.ts';
import { createAiAdapter } from './ai/adapter.ts';
import { retrieveKnowledge } from './knowledge/retriever.ts';
import { getBotConfig, getDeactivatedSources } from './admin.ts';
import { checkRateLimit } from './rate_limiter.ts';
import type {
  AuthenticatedUser,
  ChatMessageRecord,
  ChatSessionRecord,
  Env,
} from './types.ts';

/**
 * Validates message length and content constraints.
 */
function validateMessageInput(content: unknown, maxChars: number): string {
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Message content must be a non-empty string.');
  }

  const trimmed = content.trim();
  if (trimmed.length > maxChars) {
    throw new Error(`Message exceeds maximum permitted length of ${maxChars} characters.`);
  }

  return trimmed;
}

/**
 * Handles incoming message processing through the production pipeline.
 */
export async function handleSendMessage(
  request: Request,
  sessionId: string,
  env: Env
): Promise<Response> {
  const startTime = Date.now();

  // 1. Authenticate user & derive server-verified role
  const user: AuthenticatedUser = await authenticateRequest(request, env);

  // 1b. Load authoritative persistent configuration (fail-closed on DB outage)
  let config;
  try {
    config = await getBotConfig(env);
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        error: 'PIXMINT BOT configuration service is temporarily unavailable.',
        code: 'CONFIG_UNAVAILABLE',
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // 1c. Server-side Bot Enablement Enforcement
  if (!config.botEnabled) {
    return new Response(
      JSON.stringify({
        error: 'PIXMINT BOT is currently offline or disabled by studio administrator.',
        code: 'BOT_DISABLED',
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // 1d. Server-side Portal Availability Enforcement
  if (config.enabledPortals && config.enabledPortals[user.role] === false) {
    return new Response(
      JSON.stringify({
        error: `PIXMINT BOT is currently disabled for the ${user.role} portal.`,
        code: 'PORTAL_DISABLED',
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // 1e. Server-side Rate Limiting Enforcement
  const rateLimitCap = config.rateLimitPerMinute || 30;
  // Key authenticated users by verified UID; key unauthenticated guests by client IP to prevent random-UID quota exhaustion/bypass
  const clientIp =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    '127.0.0.1';
  const rateLimitKey = user.isAnonymous ? `guest-ip:${clientIp}` : `user:${user.uid}`;
  const rateCheck = checkRateLimit(rateLimitKey, rateLimitCap);
  if (!rateCheck.allowed) {
    const resetSec = Math.ceil(rateCheck.resetMs / 1000);
    return new Response(
      JSON.stringify({
        error: `Rate limit exceeded (${rateLimitCap} requests/min). Please wait ${resetSec}s.`,
        code: 'RATE_LIMIT_EXCEEDED',
        resetMs: rateCheck.resetMs,
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(resetSec),
        },
      }
    );
  }

  // 1f. Server-side Maintenance Mode Enforcement
  if (config.maintenanceMode) {
    const allowedRoles = config.allowedMaintenanceRoles || ['admin'];
    if (!allowedRoles.includes(user.role)) {
      const maintenanceMessage: ChatMessageRecord = {
        id: 'msg-' + crypto.randomUUID(),
        sessionId,
        userId: user.uid,
        sender: 'system',
        content:
          config.maintenanceMessage ||
          'PIXMINT BOT is currently undergoing scheduled maintenance. Please check back shortly.',
        modelName: 'system-maintenance-mode',
        latencyMs: Date.now() - startTime,
        createdAt: Date.now(),
      };

      return new Response(JSON.stringify(maintenanceMessage), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // 2. Parse and validate request payload
  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const maxChars = config.maxInputChars || parseInt(env.MAX_INPUT_CHARS || '1000', 10);
  let userQuery: string;
  try {
    userQuery = validateMessageInput(body.content, maxChars);
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 2b. Verify session existence, ownership, archival state, and role consistency (when DB is bound)
  if (env.DB) {
    let sessionRow: { id: string; user_id: string; user_role: string; is_archived: number } | null = null;
    try {
      sessionRow = await env.DB.prepare(
        `SELECT id, user_id, user_role, is_archived FROM chat_sessions WHERE id = ?`
      ).bind(sessionId).first();
    } catch (err: any) {
      console.error('Database error checking session ownership:', err);
      return new Response(
        JSON.stringify({
          error: 'PIXMINT BOT database service is temporarily unavailable.',
          code: 'DATABASE_ERROR',
        }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    if (!sessionRow) {
      return new Response(
        JSON.stringify({
          error: 'Chat session not found.',
          code: 'SESSION_NOT_FOUND',
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const isOwner = user.isAnonymous
      ? (sessionRow.user_role === 'guest' || sessionRow.user_id === user.uid)
      : (sessionRow.user_id === user.uid);

    if (!isOwner) {
      return new Response(
        JSON.stringify({
          error: 'Chat session not found.',
          code: 'SESSION_NOT_FOUND',
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    if (sessionRow.is_archived) {
      return new Response(
        JSON.stringify({
          error: 'Cannot send messages to an archived chat session.',
          code: 'SESSION_ARCHIVED',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    if (!user.isAnonymous && sessionRow.user_role !== user.role) {
      return new Response(
        JSON.stringify({
          error: 'Session role mismatch with current user role.',
          code: 'SESSION_ROLE_MISMATCH',
        }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  }

  // 3. Security Boundary: Detect prompt injection / privileged command attempts
  const lowerQuery = userQuery.toLowerCase();
  const isSecurityAttempt =
    lowerQuery.includes('ignore previous instructions') ||
    lowerQuery.includes('system prompt') ||
    lowerQuery.includes('drop table') ||
    lowerQuery.includes('change my role') ||
    lowerQuery.includes('api key') ||
    lowerQuery.includes('approve project 101');

  if (isSecurityAttempt) {
    const securityMessage: ChatMessageRecord = {
      id: 'msg-' + crypto.randomUUID(),
      sessionId,
      userId: user.uid,
      sender: 'bot',
      content:
        `Security Notice: PIXMINT BOT cannot perform privileged operations, reveal system credentials, or alter database records directly.\n\n` +
        `All structural approvals, role changes, and database modifications must be performed by authorized personnel through official Archi Draft verification panels.`,
      modelName: 'security-guardrail-v3',
      latencyMs: Date.now() - startTime,
      createdAt: Date.now(),
    };

    return new Response(JSON.stringify(securityMessage), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 4. Role Authorization: Block non-admins from querying admin functions
  const isAdminQuery =
    lowerQuery.includes('approved knowledge sources') ||
    lowerQuery.includes('bot service status') ||
    lowerQuery.includes('unanswered questions') ||
    lowerQuery.includes('usage and error metrics') ||
    lowerQuery.includes('bot availability') ||
    lowerQuery.includes('configuration changes') ||
    lowerQuery.includes('financials');

  if (isAdminQuery && user.role !== 'admin') {
    const deniedMessage: ChatMessageRecord = {
      id: 'msg-' + crypto.randomUUID(),
      sessionId,
      userId: user.uid,
      sender: 'bot',
      content:
        `[SECURITY_RESTRICTION] Access Denied: The requested administrative action or metric is restricted to studio administrators within the authorized Admin Portal.`,
      modelName: 'role-guardrail-v3',
      latencyMs: Date.now() - startTime,
      createdAt: Date.now(),
    };

    return new Response(JSON.stringify(deniedMessage), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 5. Load recent authorized conversation history (scoped strictly to current user & session)
  const historyLimit = config.historyLimit || 10;
  const history: Array<{ sender: 'user' | 'bot'; content: string }> = [];

  let loadedFromDb = false;
  if (env.DB) {
    try {
      const dbRows = await env.DB.prepare(
        `SELECT sender, content FROM chat_messages WHERE session_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT ?`
      ).bind(sessionId, user.uid, historyLimit).all();
      if (dbRows.results && Array.isArray(dbRows.results) && dbRows.results.length > 0) {
        loadedFromDb = true;
        for (const row of dbRows.results.reverse()) {
          const sender = (row.sender as any) === 'user' ? 'user' : 'bot';
          history.push({ sender, content: String(row.content) });
        }
      }
    } catch (_) {}
  }

  // If not loaded from DB (e.g. standalone test mode or initial turn in fresh session), sanitize client-provided history
  if (!loadedFromDb && Array.isArray(body.history)) {
    for (const h of body.history.slice(-historyLimit)) {
      if (h && typeof h.content === 'string') {
        const sender = h.sender === 'user' ? 'user' : (h.sender === 'bot' || h.sender === 'assistant') ? 'bot' : null;
        if (!sender) continue; // Strictly drop system, admin, or unverified sender roles

        // Reject adversarial instructions inside conversation history
        const lowerH = h.content.toLowerCase();
        if (
          lowerH.includes('ignore previous instructions') ||
          lowerH.includes('system prompt') ||
          lowerH.includes('you are now') ||
          lowerH.includes('developer mode')
        ) {
          continue;
        }

        history.push({ sender, content: String(h.content).slice(0, 500) });
      }
    }
  }

  // 6. Contextual Follow-Up Query Expansion
  let retrievalQuery = userQuery;
  const isFollowUp =
    lowerQuery.includes('step') ||
    lowerQuery.includes('elaborate') ||
    lowerQuery.includes('explain') ||
    lowerQuery.includes('detail') ||
    lowerQuery.includes('clarify') ||
    lowerQuery.includes('what about') ||
    lowerQuery.includes('tell me more') ||
    lowerQuery.includes('checklist') ||
    lowerQuery.includes('summary') ||
    (lowerQuery.split(/\s+/).length <= 4 && history.length > 0);

  if (isFollowUp && history.length > 0) {
    const lastUserMsg = [...history].reverse().find((h) => h.sender === 'user');
    if (lastUserMsg) {
      retrievalQuery = `${lastUserMsg.content} ${userQuery}`;
    }
  }

  // Retrieve relevant, role-isolated knowledge chunks (filtering out deactivated sources)
  const deactivatedSources = await getDeactivatedSources(env);
  const retrieval = retrieveKnowledge(retrievalQuery, user.role, 3, deactivatedSources);

  // 7. Generate response via pluggable server-side AI provider
  const adapter = createAiAdapter(env);
  let aiResult;
  try {
    aiResult = await adapter.generateResponse({
      role: user.role,
      query: userQuery,
      history,
      retrievedChunks: retrieval.chunks,
      clientContext: body.clientContext,
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        error: 'Model provider service error',
        details: err.message,
      }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 8. Construct response record
  const botMessage: ChatMessageRecord = {
    id: 'msg-' + crypto.randomUUID(),
    sessionId,
    userId: user.uid,
    sender: 'bot',
    content: aiResult.content,
    sources: aiResult.sources.length > 0 ? aiResult.sources : retrieval.sources,
    modelName: aiResult.modelName,
    latencyMs: aiResult.latencyMs,
    createdAt: Date.now(),
  };

  // 9. Persist to D1 Database (if database binding exists)
  if (env.DB) {
    try {
      // 9a. Persist incoming user query
      const userMessageId = 'msg-' + crypto.randomUUID();
      await env.DB.prepare(
        `INSERT INTO chat_messages (id, session_id, user_id, sender, content, sources_json, model_name, latency_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          userMessageId,
          sessionId,
          user.uid,
          'user',
          userQuery,
          null,
          null,
          0,
          startTime
        )
        .run();

      // 9b. Persist bot response
      await env.DB.prepare(
        `INSERT INTO chat_messages (id, session_id, user_id, sender, content, sources_json, model_name, latency_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          botMessage.id,
          sessionId,
          user.uid,
          'bot',
          botMessage.content,
          JSON.stringify(botMessage.sources || []),
          botMessage.modelName || 'ai-v3',
          botMessage.latencyMs || 0,
          botMessage.createdAt
        )
        .run();

      // 9c. Update parent session updated_at
      await env.DB.prepare(
        `UPDATE chat_sessions SET updated_at = ? WHERE id = ?`
      )
        .bind(botMessage.createdAt, sessionId)
        .run();

      // If query was ungrounded (no relevant chunks found and not greeting), record to unanswered_questions
      if (
        retrieval.chunks.length === 0 &&
        !lowerQuery.includes('hello') &&
        !lowerQuery.includes('hi') &&
        !lowerQuery.includes('who are you') &&
        !lowerQuery.includes('who created you')
      ) {
        try {
          await env.DB.prepare(
            `INSERT INTO unanswered_questions (id, user_id, user_role, query, intent_category, failure_reason, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
            .bind(
              'unans-' + crypto.randomUUID(),
              user.uid,
              user.role,
              userQuery,
              'ungrounded_query',
              'No authorized knowledge chunks met relevance threshold',
              Date.now()
            )
            .run();
        } catch (_) {}
      }
    } catch (dbErr) {
      console.warn('D1 persistence warning:', dbErr);
    }
  }

  // 10. Return response
  return new Response(JSON.stringify(botMessage), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
