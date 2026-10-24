# 🤖 PIXMINT BOT

**Your Intelligent AI Companion for Archi Draft**  
*Developed independently by PixelMint Studio MVS.*

---

## 🌟 Overview

**PIXMINT BOT** is an intelligent, reusable conversational AI chatbot module designed for the [Archi Draft](https://github.com/pixelmint-studio-mvs/Archidraft) application.

It features a high-fidelity 3D robot mascot with glowing emerald-green eyes, dark blueprint glassmorphism styling, role-aware contextual guidance, verified documentation sources, quick-action suggestion chips, optimistic messaging, and robust error recovery.

This repository (`pixelmint-studio-mvs/PIXMINT-BOT`) contains the **standalone package core**, mock engine, interactive preview harness, and automated test suite. It is developed independently so that the chatbot UI, state management, and interaction flows can be verified before integrating into the Archi Draft production branches.

---

## 🎨 Visual Identity & Mascot

The chatbot interface is crafted around the official PIXMINT BOT mascot:

- **White Polished Chassis:** High-tech rounded helmet contour with subtle linear gradients.
- **Glossy Black Visor:** Deep obsidian screen with reflections and precision border outline.
- **Emerald-Green Glowing Eyes:** Dynamic radial-flare eyes (`#10B981`) with idle floating and pulsing animations.
- **PixelMint Leaf Emblem:** Distinctive emerald leaf badge centered on the chassis forehead.
- **Blueprint Dark Aesthetics:** Deep slate background (`#0B132B`, `#0F172A`) matching Archi Draft's design tokens.

---

## 🧩 Architecture

PIXMINT BOT follows clean architecture and feature-first principles:

```
lib/
├── pixmint_bot.dart                  # Public library export
└── src/
    ├── domain/                       # Core entities & interfaces
    │   ├── models/
    │   │   ├── bot_user_role.dart    # Role mapping (Engineer, Draughtsman, Student, Admin, Guest)
    │   │   ├── chat_message.dart     # Messages, status, and verified citations
    │   │   ├── chat_session.dart     # Conversation threads
    │   │   └── chat_suggestion.dart  # Role-tailored quick action prompts
    │   └── repositories/
    │       └── pixmint_bot_repository.dart # Abstract communication contract
    ├── data/
    │   └── repositories/
    │       └── mock_pixmint_bot_repository.dart # Local simulation engine with role-aware FAQs
    ├── providers/
    │   ├── pixmint_bot_providers.dart # Riverpod providers (repository, role, suggestions)
    │   └── pixmint_chat_controller.dart # StateNotifier driving conversation lifecycle
    ├── presentation/
    │   ├── launcher/
    │   │   ├── pixmint_bot_launcher.dart   # Floating animated FAB with badge
    │   │   └── pixmint_mascot_painter.dart # Vector/Canvas mascot renderer
    │   ├── sheet/
    │   │   ├── pixmint_chat_sheet.dart     # Full conversational modal & responsive sheet
    │   │   ├── pixmint_chat_header.dart    # Header with role tag & session reset
    │   │   └── pixmint_chat_input.dart     # Pill input bar with character counter & send
    │   └── widgets/
    │       ├── chat_bubble.dart            # User/Bot speech bubbles with source citations
    │       ├── quick_action_chips.dart     # One-tap prompt suggestion chips
    │       ├── typing_indicator.dart       # Pulsing emerald dots thinking indicator
    │       └── error_retry_banner.dart     # Network error display with 1-tap retry
    └── theme/
        └── pixmint_bot_theme.dart    # Palette, elevations, typography, and styling tokens
```

---

## 🚀 Getting Started

### Prerequisites

- Flutter SDK `^3.13.2` or later (tested on Flutter `3.47.2` / Dart `3.13.2`)
- Git

### 1. Run the Standalone Interactive Studio

An interactive test harness and preview workspace is included in `example/`:

```bash
cd example
flutter pub get
flutter run
```

*Supported platforms:* Windows Desktop, macOS, Linux, Chrome/Web, iOS, Android.

#### Interactive Features in the Example Harness:
1. **Role Switcher:** Toggle between **Engineer**, **Draughtsman**, **Student**, and **Studio Admin** to observe how the welcome message, guidance, and suggestions dynamically update.
2. **Floating Launcher:** Tap the mascot in the bottom-right corner to open the expandable bottom sheet.
3. **Quick Actions:** Tap any suggestion chip at the top for instant answers.
4. **Verified Sources:** Tap the "Verified Sources" accordion on bot responses to inspect documentation citations.
5. **Failure Simulation:** Toggle "Simulate Network Failure" to test error banners and message retry.

---

## 🧪 Automated Testing

All domain models, repository methods, Riverpod state controllers, and presentation widgets are covered by automated tests.

Run the test suite:

```bash
flutter test
```

### Test Coverage Summary:
- ✅ `test/models_test.dart`: Entity serialization, role parsing, and message copyWith methods.
- ✅ `test/mock_repository_test.dart`: Session creation, role-aware responses, citations, failure simulation, and session clearing.
- ✅ `test/chat_controller_test.dart`: Riverpod controller state lifecycle, optimistic updates, delivery failures, retries, and role switching.
- ✅ `test/widget_test.dart`: Launcher rendering, avatar animation, header tags, suggestion chips, and message bubble formatting.

---

## 📋 Integration Roadmap with Archi Draft

| Phase | Description | Status | Target Location |
|---|---|---|---|
| **Phase 1** | Standalone PIXMINT BOT Core Package & UI | **✅ Complete** | `pixelmint-studio-mvs/PIXMINT-BOT` |
| **Phase 2** | Additive Backend Endpoints & D1 Migration | ⏳ Next | `worker/src/chat.ts` + `worker/migrations/0017_pixmint_bot.sql` |
| **Phase 3** | Flutter Integration on `COMPLETED-INTERGRATION` | 📋 Planned | `lib/src/features/pixmint_bot/` |
| **Phase 4** | Admin Portal Web Integration (Next.js) | 📋 Planned | `apps/admin-web/src/components/pixmint-bot/` |

### Phase 2 Readiness (Planned Endpoints)
When authorized to begin Phase 2, additive Cloudflare Worker endpoints will be implemented:
- `POST /api/chat/sessions` — Create authenticated session.
- `GET /api/chat/sessions` — List conversation history.
- `POST /api/chat/sessions/:id/messages` — Send message with role validation.
- `GET /api/chat/suggestions` — Role-based quick prompts.

---

## 🌐 Environments & Deployment Separation

PIXMINT BOT backend infrastructure enforces strict isolation between staging and production:

| Parameter | Staging Environment | Production Environment |
|:---|:---|:---|
| **Worker Script** | `archidraft-pixmint-bot-staging` | `archidraft-pixmint-bot` |
| **D1 Database** | `archidraft-d1-staging` | `archidraft-d1` |
| **Default Provider** | `local_grounded` (grounded synthesis) | Pluggable (`local_grounded` / `cloudflare`) |
| **Secrets Scope** | Staging secrets via `wrangler secret put --env staging` | Production secrets via `wrangler secret put` |
| **Safety Invariant** | Zero cross-environment leakage; staging operations never mutate production resources. | Controlled release gate with full verification. |

---

## 🔐 Security & Privacy Principles

- **Server-Side Enforcement:** User identity and permissions are strictly derived from verified Firebase Auth Bearer tokens on the backend.
- **Role Isolation:** Clients cannot forge roles or access administrative guidance without server-side verification.
- **Zero Exposed Secrets:** AI provider keys are never packaged with client assets or committed to git.
- **Input Guardrails:** Messages are validated and capped at 1,000 characters to prevent prompt overflow or abuse.

---

## 👨‍💻 Development & Ownership

- **Product:** PIXMINT BOT
- **Studio:** PixelMint Studio MVS
- **Host Application:** Archi Draft
