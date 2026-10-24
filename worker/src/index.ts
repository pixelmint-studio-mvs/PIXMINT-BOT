import { authenticateRequest, AuthError } from './auth.ts';
import { handleSendMessage } from './chat.ts';
import {
  handleAdminAnalytics,
  handleAdminHealth,
  handleGetConfig,
  handleUpdateConfig,
  handleGetAuditLogs,
  handleGetKnowledgeSources,
  handleUpdateKnowledgeSourceStatus,
  handleGetFeedback,
  handleGetUnansweredQuestions,
} from './admin.ts';
import type { BotUserRole, ChatSessionRecord, Env } from './types.ts';

function corsHeaders(request: Request): Headers {
  const headers = new Headers();
  const origin = request.headers.get('Origin') || '*';
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  headers.set('Access-Control-Max-Age', '86400');
  return headers;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const headers = corsHeaders(request);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // 1. Suggested Questions endpoint
      if (path === '/api/chat/suggestions' && request.method === 'GET') {
        const user = await authenticateRequest(request, env);
        const roleParam = (url.searchParams.get('role') || user.role) as BotUserRole;

        // Default suggestions catalog
        const suggestionsMap: Record<string, string[]> = {
          engineer: [
            'How do I review a drawing?',
            'How do I add redline annotations?',
            'What should I check during technical review?',
            'How do I identify drawing issues?',
            'How can I coordinate drawing revisions?',
            'What should I do if a drawing fails to load?',
            'How do I resolve a review problem?',
            'What can PIXMINT BOT help me with?',
          ],
          draughtsman: [
            'How do I view my assignments?',
            'How do I accept an assignment?',
            'How do I upload a drawing?',
            'Which drawing formats are supported?',
            'How do I submit a revised drawing?',
            'How do I resolve redline comments?',
            'What should I do if an upload fails?',
            'How do I check my submission status?',
          ],
          student: [
            'How do I access my training modules?',
            'Where can I find my practical exercises?',
            'How do I submit an exercise?',
            'Where can I view my evaluation?',
            'How do I understand mentor feedback?',
            'How can I verify my certificate?',
            'What should I do if a lesson will not open?',
            'What can PIXMINT BOT help me learn?',
          ],
          admin: [
            'How do I manage approved knowledge sources?',
            'How do I update suggested questions?',
            'How do I check bot service status?',
            'How do I review unanswered questions?',
            'How can I review usage and error metrics?',
            'How do I manage bot availability?',
            'How can I review configuration changes?',
          ],
        };

        const targetRole = user.role === 'admin' ? roleParam : user.role;
        const questions = suggestionsMap[targetRole] || suggestionsMap.engineer;

        const responsePayload = questions.map((q, idx) => ({
          id: `sug-${targetRole}-${idx + 1}`,
          role: targetRole,
          label: q,
          prompt: q,
          icon: 'help_outline',
          sortOrder: idx,
          isActive: true,
        }));

        headers.set('Content-Type', 'application/json');
        return new Response(JSON.stringify(responsePayload), { status: 200, headers });
      }

      // 2. Chat Session management
      if (path === '/api/chat/sessions' && request.method === 'POST') {
        const user = await authenticateRequest(request, env);
        let sessionTitle = 'New Conversation';
        try {
          const body: any = await request.json();
          if (body?.title && typeof body.title === 'string' && body.title.trim()) {
            sessionTitle = body.title.trim().slice(0, 100);
          }
        } catch (_) {}

        const session: ChatSessionRecord = {
          id: 'sess-' + crypto.randomUUID(),
          userId: user.uid,
          userRole: user.role,
          title: sessionTitle,
          isArchived: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        if (env.DB) {
          try {
            await env.DB.prepare(
              `INSERT INTO chat_sessions (id, user_id, user_role, title, is_archived, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)`
            )
              .bind(
                session.id,
                session.userId,
                session.userRole,
                session.title,
                session.isArchived ? 1 : 0,
                session.createdAt,
                session.updatedAt
              )
              .run();
          } catch (err: any) {
            console.error('Failed to persist chat session:', err);
            headers.set('Content-Type', 'application/json');
            return new Response(
              JSON.stringify({
                error: 'Failed to persist chat session to database.',
                code: 'SESSION_PERSISTENCE_FAILED',
              }),
              { status: 500, headers }
            );
          }
        }

        headers.set('Content-Type', 'application/json');
        return new Response(JSON.stringify(session), { status: 201, headers });
      }

      if (path === '/api/chat/sessions' && request.method === 'GET') {
        const user = await authenticateRequest(request, env);
        if (!env.DB) {
          headers.set('Content-Type', 'application/json');
          return new Response(JSON.stringify([]), { status: 200, headers });
        }
        const { results } = await env.DB.prepare(
          `SELECT id, user_id, user_role, title, is_archived, created_at, updated_at
           FROM chat_sessions WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50`
        ).bind(user.uid).all();
        const formatted = (results || []).map((r: any) => ({
          id: r.id,
          userId: r.user_id,
          userRole: r.user_role,
          title: r.title,
          isArchived: Boolean(r.is_archived),
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        }));
        headers.set('Content-Type', 'application/json');
        return new Response(JSON.stringify(formatted), { status: 200, headers });
      }

      // 3. Message routing (GET and POST)
      const messageMatch = path.match(/^\/api\/chat\/sessions\/([^/]+)\/messages$/);
      if (messageMatch && request.method === 'GET') {
        const sessionId = messageMatch[1];
        const user = await authenticateRequest(request, env);
        if (env.DB) {
          const sessionRow = await env.DB.prepare(
            `SELECT id, user_id, user_role, is_archived FROM chat_sessions WHERE id = ?`
          ).bind(sessionId).first<{ id: string; user_id: string; user_role: string; is_archived: number }>();

          if (!sessionRow) {
            headers.set('Content-Type', 'application/json');
            return new Response(
              JSON.stringify({ error: 'Chat session not found.', code: 'SESSION_NOT_FOUND' }),
              { status: 404, headers }
            );
          }

          const isOwner = user.isAnonymous
            ? (sessionRow.user_role === 'guest' || sessionRow.user_id === user.uid)
            : (sessionRow.user_id === user.uid);

          if (!isOwner) {
            headers.set('Content-Type', 'application/json');
            return new Response(
              JSON.stringify({ error: 'Chat session not found.', code: 'SESSION_NOT_FOUND' }),
              { status: 404, headers }
            );
          }

          const { results } = await env.DB.prepare(
            `SELECT id, session_id, user_id, sender, content, sources_json, model_name, latency_ms, created_at
             FROM chat_messages WHERE session_id = ? AND user_id = ? ORDER BY created_at ASC`
          ).bind(sessionId, user.uid).all();

          const messages = (results || []).map((r: any) => ({
            id: r.id,
            sessionId: r.session_id,
            userId: r.user_id,
            sender: r.sender,
            content: r.content,
            sources: r.sources_json ? JSON.parse(r.sources_json) : [],
            modelName: r.model_name,
            latencyMs: r.latency_ms,
            createdAt: r.created_at,
          }));
          headers.set('Content-Type', 'application/json');
          return new Response(JSON.stringify(messages), { status: 200, headers });
        }
        headers.set('Content-Type', 'application/json');
        return new Response(JSON.stringify([]), { status: 200, headers });
      }

      if (messageMatch && request.method === 'POST') {
        const sessionId = messageMatch[1];
        const res = await handleSendMessage(request, sessionId, env);
        // Copy CORS headers
        for (const [k, v] of headers.entries()) {
          res.headers.set(k, v);
        }
        return res;
      }

      // 4. Admin routes
      if (path === '/api/admin/health' && request.method === 'GET') {
        const res = await handleAdminHealth(request, env);
        for (const [k, v] of headers.entries()) res.headers.set(k, v);
        return res;
      }

      if (path === '/api/admin/analytics' && request.method === 'GET') {
        const res = await handleAdminAnalytics(request, env);
        for (const [k, v] of headers.entries()) res.headers.set(k, v);
        return res;
      }

      if (path === '/api/admin/config' && request.method === 'GET') {
        const res = await handleGetConfig(request, env);
        for (const [k, v] of headers.entries()) res.headers.set(k, v);
        return res;
      }

      if (path === '/api/admin/config' && (request.method === 'POST' || request.method === 'PUT')) {
        const res = await handleUpdateConfig(request, env);
        for (const [k, v] of headers.entries()) res.headers.set(k, v);
        return res;
      }

      if (path === '/api/admin/audit-logs' && request.method === 'GET') {
        const res = await handleGetAuditLogs(request, env);
        for (const [k, v] of headers.entries()) res.headers.set(k, v);
        return res;
      }

      if (path === '/api/admin/knowledge/sources' && request.method === 'GET') {
        const res = await handleGetKnowledgeSources(request, env);
        for (const [k, v] of headers.entries()) res.headers.set(k, v);
        return res;
      }

      const sourceStatusMatch = path.match(/^\/api\/admin\/knowledge\/sources\/([^/]+)\/status$/);
      if (sourceStatusMatch && (request.method === 'POST' || request.method === 'PUT')) {
        const sourceId = decodeURIComponent(sourceStatusMatch[1]);
        const res = await handleUpdateKnowledgeSourceStatus(request, sourceId, env);
        for (const [k, v] of headers.entries()) res.headers.set(k, v);
        return res;
      }

      if (path === '/api/admin/feedback' && request.method === 'GET') {
        const res = await handleGetFeedback(request, env);
        for (const [k, v] of headers.entries()) res.headers.set(k, v);
        return res;
      }

      if (path === '/api/admin/unanswered' && request.method === 'GET') {
        const res = await handleGetUnansweredQuestions(request, env);
        for (const [k, v] of headers.entries()) res.headers.set(k, v);
        return res;
      }

      // 404 Route
      headers.set('Content-Type', 'application/json');
      return new Response(JSON.stringify({ error: 'Endpoint not found' }), {
        status: 404,
        headers,
      });
    } catch (err: any) {
      const statusCode = err instanceof AuthError ? err.statusCode : 500;
      headers.set('Content-Type', 'application/json');
      return new Response(
        JSON.stringify({
          error: err.message || 'Internal server error',
          status: statusCode,
        }),
        { status: statusCode, headers }
      );
    }
  },
};
