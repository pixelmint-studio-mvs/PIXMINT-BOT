# PIXMINT-BOT
An intelligent, reusable AI chatbot for Archi Draft, featuring a floating 3D robot mascot, role-aware assistance, FAQ guidance, troubleshooting, and secure AI integration. Developed independently by PixelMint Studio MVS.

🤖 PIXMINT BOT

Your Smart AI Companion for Archi Draft

PIXMINT BOT is an independently developed, reusable AI chatbot module designed for integration into the Archi Draft application by PixelMint Studio MVS.

It aims to provide intelligent product guidance, approved FAQ answers, role-aware assistance, troubleshooting, and contextual support through a premium conversational interface featuring a friendly, floating robot mascot.

«Project status: Initial development and architecture planning.»

---

✨ Vision

Build a reliable, secure, visually engaging AI assistant that helps Archi Draft users understand the platform, navigate workflows, resolve common issues, and find relevant guidance.

PIXMINT BOT is being developed as a standalone module so it can be tested, maintained, and integrated into the application without unnecessarily disrupting the existing portal implementations.

🎯 Core Objectives

- 🤖 Distinctive AI Identity — A recognizable robot mascot with a premium, futuristic visual design.
- 💬 Conversational Assistance — Natural-language answers to supported questions.
- 📚 Knowledge-Based FAQs — Answers grounded in approved Archi Draft documentation.
- 👥 Role-Aware Guidance — Support for Engineer, Draughtsman, Student, and Studio Admin workflows.
- 🔐 Security and Privacy — Server-side authorization, secure credential handling, and protection of private information.
- 🧩 Reusable Architecture — A modular design intended for integration across supported application portals.
- 🛠️ Troubleshooting — Clear guidance for common application and workflow issues.
- 📱 Responsive Interface — A compact floating chatbot with an accessible expanded chat experience.

🎨 Visual Identity

The chatbot uses the supplied robot artwork as its visual reference.

Design direction:

- White, polished robot body.
- Glossy black face.
- Emerald-green glowing eyes.
- Green leaf emblem.
- Subtle floating animations and realistic 3D-style depth.
- Premium dark interface with emerald-green and complementary accent colors.
- Compact launcher that does not obstruct essential application controls.

The mascot, branding, and interface should remain consistent across supported platforms.

🧩 Planned Capabilities

1. Chat Interface

- Floating robot launcher.
- Expandable conversational window.
- Message history and quick actions.
- Loading, error, retry, and offline states.
- Responsive layouts and accessibility support.

2. AI Assistance

- Answers based on approved knowledge.
- Clear handling of unknown or unsupported questions.
- Contextual product guidance.
- Troubleshooting and support navigation.

3. Role-Aware Guidance

- Engineer portal assistance.
- Draughtsman portal assistance.
- Student portal assistance.
- Studio Admin guidance, subject to authorization.

4. Secure Backend Integration

- Integration with the existing application's authenticated backend where appropriate.
- Server-side identity verification and permission checks.
- Protected AI provider credentials.
- Validated API requests and responses.
- Appropriate abuse prevention and error handling.

5. Knowledge Management

- Organized FAQ and documentation content.
- Versioned knowledge articles.
- Role-based content permissions.
- Approved and reviewed information.
- Controlled retrieval of relevant content.

🏗️ Intended Architecture

The final architecture will be determined after auditing the existing Archi Draft codebase.

Conceptual flow:

Archi Draft Application
          |
          v
PIXMINT BOT Chat Interface
          |
          v
Authenticated Chat API
          |
          v
Authorization and Knowledge Retrieval
          |
          v
Approved AI Provider
          |
          v
Validated Assistant Response

The chatbot should reuse existing authentication and backend services wherever suitable. A separate backend will only be introduced if the architecture review justifies it.

🔗 Integration Strategy

PIXMINT BOT is being developed in a separate GitHub repository to keep chatbot development independent from the ongoing Archi Draft portal work.

The planned integration targets are:

- Engineer Portal
- Draughtsman Portal
- Student Portal
- Studio Admin Portal, when its implementation is ready

Integration will require a documented interface, compatible dependencies, appropriate authentication, and testing within each host application. A separate web-based Admin panel may require a compatible web integration.

Creating or merging a GitHub repository alone does not automatically integrate the chatbot into the application.

🔐 Security Principles

- Never expose API keys or privileged credentials in client-side code.
- Verify authentication and enforce authorization on the server.
- Do not trust client-supplied roles or user IDs for access control.
- Prevent unauthorized access to private projects and user information.
- Treat user messages and retrieved documents as untrusted input.
- Protect against prompt injection and unsafe tool execution.
- Use approved knowledge sources and permission-aware retrieval.
- Do not perform privileged administrative actions autonomously.
- Avoid collecting or retaining unnecessary conversation data.

🧪 Quality and Testing

Planned validation includes:

- UI and responsive-layout tests.
- Authentication and authorization tests.
- Cross-user and cross-role access tests.
- AI provider failure and timeout handling.
- Prompt-injection and information-leakage tests.
- Knowledge retrieval permission tests.
- Integration tests for each supported portal.

Only tests that have actually been executed should be reported as passing.

🚧 Development Roadmap

- [ ] Audit the existing Archi Draft architecture.
- [ ] Finalize the chatbot module design.
- [ ] Develop the floating robot launcher and chat UI.
- [ ] Implement the conversational service and backend API.
- [ ] Build the approved FAQ and knowledge system.
- [ ] Implement security and privacy controls.
- [ ] Test chatbot functionality and failure states.
- [ ] Document the API contract and integration process.
- [ ] Integrate with the Engineer, Draughtsman, and Student portals.
- [ ] Integrate with the Admin portal when ready.
- [ ] Prepare a stable release.

🛠️ Technology Stack

The final technology stack will be selected after reviewing the existing project.

Potential technologies include:

- Flutter and Dart for a reusable mobile application module.
- The existing Cloudflare Worker backend, where appropriate.
- Firebase Authentication, if confirmed as the existing authentication system.
- An approved AI provider selected after evaluating security, cost, and compatibility.
- An appropriate knowledge retrieval system based on actual requirements.

These technologies are proposed options, not a claim that every component has already been implemented.

👨‍💻 Development and Ownership

Project: PIXMINT BOT
Studio: PixelMint Studio MVS
Host application: Archi Draft
Development approach: Independent module followed by controlled integration.

This repository is intended for source code, documentation, tests, approved assets, and integration instructions.

Do not commit secrets, private user records, production credentials, or confidential project documents.

📌 Current Status

PIXMINT BOT is in its initial development and planning stage. Features, integrations, and release readiness will be updated as implementation and testing progress.

---

PIXMINT BOT — Built for Archi Draft.

Developed under PixelMint Studio MVS.
