# PIXMINT BOT — Cloudflare Worker Backend

Production and staging Cloudflare Workers API for PIXMINT BOT, featuring D1 session persistence, server-verified Firebase Authentication, role-based authorization guardrails, and deterministic grounded synthesis.

---

## 🏛️ Architecture & Endpoints

- **Chat Sessions:**
  - `POST /api/chat/sessions` — Authenticated session creation with verified UID & server-derived role persistence in D1.
  - `GET /api/chat/sessions` — Lists authenticated sessions owned by the calling user.
- **Messages:**
  - `POST /api/chat/sessions/:id/messages` — Role-validated messaging with dual user/bot persistence and strict ownership validation.
  - `GET /api/chat/sessions/:id/messages` — Retrieves session message history for verified session owners.
- **Suggestions & Catalog:**
  - `GET /api/chat/suggestions` — Role-isolated quick prompt catalog.
- **Admin & Health:**
  - `GET /api/admin/health` — Service status, provider health, and version information.
  - `GET /api/admin/config` & `POST /api/admin/config` — Bot runtime configuration management (persisted to D1 `bot_config`).
  - `GET /api/admin/analytics` & `GET /api/admin/audit-logs` — Operational metrics and sanitized audit trail.

---

## 🛡️ Environments & Safe Deployment Separation

The worker uses Wrangler environments to ensure complete isolation between staging and production.

| Configuration | Staging (`--env staging`) | Production (default) |
|:---|:---|:---|
| **Worker Script** | `archidraft-pixmint-bot-staging` | `archidraft-pixmint-bot` |
| **D1 Database** | `archidraft-d1-staging` | `archidraft-d1` |
| **D1 UUID** | `206f9030-74f2-473f-81d1-06a9a848ea2b` | *Production UUID* |
| **Environment Variable** | `ENVIRONMENT="staging"` | `ENVIRONMENT="production"` |
| **Rate Limit** | `60` requests/min | `30` requests/min |

### 1. Safe Staging Deployment
```bash
# Dry run verification
npx wrangler deploy --env staging --dry-run

# Live staging deployment
npx wrangler deploy --env staging
```

### 2. Production Deployment
*Production deployments require explicit verification and change approval.*
```bash
# Dry run verification
npx wrangler deploy --dry-run

# Production deployment
npx wrangler deploy
```

---

## 🔐 Secrets Management Policy

Secret credentials are **never committed to source control** or placed in `wrangler.toml`. They are injected securely via Cloudflare encrypted secrets:

```bash
# Staging secrets
npx wrangler secret put FIREBASE_PROJECT_ID --env staging
npx wrangler secret put AI_PROVIDER_API_KEY --env staging

# Production secrets
npx wrangler secret put FIREBASE_PROJECT_ID
npx wrangler secret put AI_PROVIDER_API_KEY
```

---

## 🗄️ Database Migrations

Database schema migrations are located in `migrations/`:
- `0017_pixmint_bot.sql`: Core schema (sessions, messages, knowledge chunks, suggestions, feedback, audit logs).
- `0018_knowledge_approval.sql`: Knowledge approval workflow and status tracking.

To execute migrations:
```bash
# Staging D1
npx wrangler d1 migrations apply archidraft-d1-staging --remote

# Production D1 (Protected — explicit authorization required)
npx wrangler d1 migrations apply archidraft-d1 --remote
```

---

## 🧪 Automated Testing

Run the full local test suite (Node.js test runner via `tsx`):
```bash
npm test
```

Tests cover:
- Admin configuration persistence and fail-closed behavior
- Security guardrails, prompt-injection defense, and role isolation
- Token signature, audience, issuer, and expiration claim verification
- Session creation, ownership validation, cross-user denial, and archival enforcement
