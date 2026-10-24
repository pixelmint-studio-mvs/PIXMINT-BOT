import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:pixmint_bot/pixmint_bot.dart';

void main() {
  runApp(
    const ProviderScope(
      child: PixmintBotDemoApp(),
    ),
  );
}

class PixmintBotDemoApp extends StatelessWidget {
  const PixmintBotDemoApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'PIXMINT BOT • Smart Guide for ARCHI DRAFT',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF07141E),
        colorScheme: const ColorScheme.dark(
          primary: PixmintBotTheme.emerald,
          secondary: PixmintBotTheme.cyan,
          surface: PixmintBotTheme.surface,
        ),
        fontFamily: 'Inter',
      ),
      home: const DemoWorkspaceScreen(),
    );
  }
}

class DemoWorkspaceScreen extends ConsumerStatefulWidget {
  const DemoWorkspaceScreen({super.key});

  @override
  ConsumerState<DemoWorkspaceScreen> createState() =>
      _DemoWorkspaceScreenState();
}

class _DemoWorkspaceScreenState extends ConsumerState<DemoWorkspaceScreen> {
  bool _simulateNetworkFailure = false;

  @override
  Widget build(BuildContext context) {
    final activeRole = ref.watch(pixmintRoleProvider);
    final repo = ref.read(pixmintRepositoryProvider);

    if (repo is MockPixmintBotRepository) {
      repo.shouldSimulateFailure = _simulateNetworkFailure;
    }

    return Scaffold(
      backgroundColor: const Color(0xFF07141E),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0B1B27),
        elevation: 0,
        title: Row(
          children: [
            const PixmintRobotAvatar(
              size: 32,
              showOrbitalRing: true,
              animate: true,
            ),
            const SizedBox(width: 12),
            const Text(
              'ARCHI DRAFT • PIXMINT BOT',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                letterSpacing: 0.5,
              ),
            ),
            const Spacer(),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: PixmintBotTheme.emeraldMuted,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: PixmintBotTheme.emerald.withValues(alpha: 0.5),
                ),
              ),
              child: Text(
                'Active: ${activeRole.displayName}',
                style: const TextStyle(
                  color: PixmintBotTheme.emeraldGlow,
                  fontSize: 12,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ],
        ),
      ),
      body: Stack(
        children: [
          // Blueprint grid background
          CustomPaint(
            size: Size.infinite,
            painter: _DemoBlueprintPainter(),
          ),

          // Main control canvas
          SingleChildScrollView(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildHeaderCard(activeRole),
                const SizedBox(height: 24),
                _buildMascotShowcaseCard(),
                const SizedBox(height: 24),
                _buildRoleSwitcher(activeRole),
                const SizedBox(height: 24),
                _buildTestingToolsCard(),
                const SizedBox(height: 24),
                _buildWorkflowHintsCard(activeRole),
              ],
            ),
          ),

          // Official Floating PIXMINT BOT Launcher
          const Positioned(
            bottom: 28,
            right: 28,
            child: PixmintBotLauncher(size: 64),
          ),
        ],
      ),
    );
  }

  Widget _buildHeaderCard(BotUserRole role) {
    final chatState = ref.watch(pixmintChatControllerProvider);

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: PixmintBotTheme.glassCardDecoration,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          PixmintLivingMascot(
            size: 88,
            state: chatState.mascotState,
            isThinking: chatState.isThinking,
            statusBadgeText: 'Online • ${role.displayName} Portal',
          ),
          const SizedBox(width: 20),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ShaderMask(
                  shaderCallback: (bounds) => const LinearGradient(
                    colors: [
                      Colors.white,
                      PixmintBotTheme.emeraldGlow,
                      PixmintBotTheme.cyan,
                    ],
                  ).createShader(bounds),
                  child: const Text(
                    'PIXELMINT MVS AI ASSISTANT',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w900,
                      color: Colors.white,
                      letterSpacing: 0.6,
                    ),
                  ),
                ),
                const SizedBox(height: 3),
                const Text(
                  'Your Smart Guide for ARCHI DRAFT',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: PixmintBotTheme.emeraldGlow,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Faithfully designed from official character specifications. Tap the waving mascot or open the floating launcher to experience world-class conversational CAD assistance in ${role.displayName} mode.',
                  style: const TextStyle(
                    fontSize: 13,
                    color: PixmintBotTheme.textSecondary,
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMascotShowcaseCard() {
    final chatState = ref.watch(pixmintChatControllerProvider);
    final activeState = chatState.mascotState;

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: PixmintBotTheme.glassCardDecoration,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: PixmintBotTheme.emeraldMuted,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(
                  Icons.auto_awesome,
                  size: 16,
                  color: PixmintBotTheme.emeraldGlow,
                ),
              ),
              const SizedBox(width: 10),
              const Text(
                'Character Reference Expressions & Modes',
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.bold,
                  color: PixmintBotTheme.textPrimary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          const Text(
            'Test live multi-state reactions reproduced from assets/images/pixmint_bot.jpeg:',
            style: TextStyle(fontSize: 12, color: PixmintBotTheme.textMuted),
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              _buildStateChip('Default (Calm)', MascotAnimationState.idle, activeState),
              _buildStateChip('Wave Hello', MascotAnimationState.greeting, activeState),
              _buildStateChip('Thinking Scan', MascotAnimationState.thinking, activeState),
              _buildStateChip('Answering', MascotAnimationState.answering, activeState),
              _buildStateChip('Excited / Success', MascotAnimationState.success, activeState),
              _buildStateChip('Attention / Error', MascotAnimationState.error, activeState),
              _buildStateChip('Offline Mode', MascotAnimationState.offline, activeState),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildStateChip(String label, MascotAnimationState state, MascotAnimationState activeState) {
    final isSelected = state == activeState;
    return ChoiceChip(
      selected: isSelected,
      label: Text(label),
      selectedColor: state.glowColor,
      backgroundColor: PixmintBotTheme.surfaceElevated,
      labelStyle: TextStyle(
        color: isSelected ? Colors.black : PixmintBotTheme.textPrimary,
        fontWeight: FontWeight.bold,
        fontSize: 12,
      ),
      onSelected: (_) {
        ref.read(pixmintChatControllerProvider.notifier).setMascotState(state);
      },
    );
  }

  Widget _buildRoleSwitcher(BotUserRole activeRole) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: PixmintBotTheme.glassCardDecoration,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Switch Role Simulation',
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.bold,
              color: PixmintBotTheme.textPrimary,
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Selecting a role customizes the bot welcome message, context guidance, and suggestion chips.',
            style: TextStyle(fontSize: 12, color: PixmintBotTheme.textMuted),
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: [
              _buildRoleChip(BotUserRole.engineer, Icons.engineering, activeRole),
              _buildRoleChip(BotUserRole.draughtsman, Icons.architecture, activeRole),
              _buildRoleChip(BotUserRole.student, Icons.school, activeRole),
              _buildRoleChip(BotUserRole.admin, Icons.admin_panel_settings, activeRole),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildRoleChip(BotUserRole role, IconData icon, BotUserRole activeRole) {
    final isSelected = role == activeRole;

    return ChoiceChip(
      selected: isSelected,
      label: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            icon,
            size: 16,
            color: isSelected ? Colors.black : PixmintBotTheme.emeraldGlow,
          ),
          const SizedBox(width: 6),
          Text(role.displayName),
        ],
      ),
      selectedColor: PixmintBotTheme.emerald,
      backgroundColor: PixmintBotTheme.surfaceElevated,
      labelStyle: TextStyle(
        color: isSelected ? Colors.black : PixmintBotTheme.textPrimary,
        fontWeight: FontWeight.bold,
      ),
      onSelected: (_) {
        ref.read(pixmintRoleProvider.notifier).state = role;
        ref.read(pixmintChatControllerProvider.notifier).switchRole(role);
      },
    );
  }

  Widget _buildTestingToolsCard() {
    final useRemote = ref.watch(pixmintUseRemoteProvider);
    final baseUrl = ref.watch(pixmintApiBaseUrlProvider);

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: PixmintBotTheme.glassCardDecoration,
      child: Column(
        children: [
          Row(
            children: [
              const Icon(Icons.cloud_sync_outlined, color: PixmintBotTheme.emeraldGlow),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Use Cloudflare Worker Backend',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                        color: PixmintBotTheme.textPrimary,
                      ),
                    ),
                    Text(
                      useRemote
                          ? 'Active: $baseUrl (with offline fallback)'
                          : 'Local Grounded Engine (Embedded Knowledge)',
                      style: const TextStyle(fontSize: 12, color: PixmintBotTheme.textMuted),
                    ),
                  ],
                ),
              ),
              Switch(
                value: useRemote,
                activeThumbColor: PixmintBotTheme.emerald,
                onChanged: (val) {
                  ref.read(pixmintUseRemoteProvider.notifier).state = val;
                },
              ),
            ],
          ),
          Divider(height: 24, color: PixmintBotTheme.textMuted.withValues(alpha: 0.2)),
          Row(
            children: [
              const Icon(Icons.bug_report_outlined, color: PixmintBotTheme.warning),
              const SizedBox(width: 12),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Simulate Network Failure',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                        color: PixmintBotTheme.textPrimary,
                      ),
                    ),
                    Text(
                      'Triggers network error when sending messages to test error banner and retry.',
                      style: TextStyle(fontSize: 12, color: PixmintBotTheme.textMuted),
                    ),
                  ],
                ),
              ),
              Switch(
                value: _simulateNetworkFailure,
                activeThumbColor: PixmintBotTheme.warning,
                onChanged: (val) {
                  setState(() {
                    _simulateNetworkFailure = val;
                  });
                },
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildWorkflowHintsCard(BotUserRole role) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: PixmintBotTheme.glassCardDecoration,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Official Test Scenarios from Reference Design:',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.bold,
              color: PixmintBotTheme.textPrimary,
            ),
          ),
          const SizedBox(height: 10),
          _buildBullet('Tap the floating robot mascot launcher in the bottom right corner.'),
          _buildBullet('Click "How to start a project?" to view the 4-step project initiation guide.'),
          _buildBullet('Click "Track my project" to view the 5-phase milestone approval pipeline.'),
          _buildBullet('Click "Understand assignments" to view studio work package lifecycle states.'),
          _buildBullet('Click "Report a problem" for drawing review disputes, CAD purging, and support escalation.'),
          _buildBullet('Ask structural or CAD questions (e.g., "What are the CAD layer naming standards?" or "Calculate beam deflection").'),
          _buildBullet('Toggle "Simulate Network Failure" to verify offline error resilience and one-tap retry.'),
        ],
      ),
    );
  }

  Widget _buildBullet(String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('• ', style: TextStyle(color: PixmintBotTheme.emeraldGlow, fontSize: 14)),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(color: PixmintBotTheme.textSecondary, fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }
}

class _DemoBlueprintPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.white.withValues(alpha: 0.035)
      ..strokeWidth = 1.0;

    const double step = 36.0;
    for (double x = 0; x < size.width; x += step) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
    }
    for (double y = 0; y < size.height; y += step) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
