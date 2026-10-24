import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pixmint_bot/pixmint_bot.dart';

void main() {
  group('PIXMINT BOT — Living AI Mascot Animation System Tests', () {
    late MockPixmintBotRepository repository;

    setUp(() {
      repository = MockPixmintBotRepository(simulatedDelay: Duration.zero);
    });

    // ── 1. MascotAnimationState Enum Specification ──────────────────────────
    test('1. MascotAnimationState enum covers all 7 official lifecycle states', () {
      expect(MascotAnimationState.values.length, equals(7));
      expect(MascotAnimationState.values, contains(MascotAnimationState.idle));
      expect(MascotAnimationState.values, contains(MascotAnimationState.greeting));
      expect(MascotAnimationState.values, contains(MascotAnimationState.thinking));
      expect(MascotAnimationState.values, contains(MascotAnimationState.answering));
      expect(MascotAnimationState.values, contains(MascotAnimationState.success));
      expect(MascotAnimationState.values, contains(MascotAnimationState.error));
      expect(MascotAnimationState.values, contains(MascotAnimationState.offline));
    });

    test('2. State colors, glow intensities, and flags reflect brand guidelines', () {
      // Idle & Greeting use emerald glow
      expect(MascotAnimationState.idle.glowColor, equals(PixmintBotTheme.emeraldGlow));
      expect(MascotAnimationState.greeting.glowColor, equals(PixmintBotTheme.emeraldGlow));
      expect(MascotAnimationState.idle.baseGlowIntensity, equals(0.75));
      expect(MascotAnimationState.greeting.baseGlowIntensity, equals(1.0));

      // Thinking uses cyan
      expect(MascotAnimationState.thinking.glowColor, equals(PixmintBotTheme.cyan));
      expect(MascotAnimationState.thinking.isProcessing, isTrue);

      // Answering is an active processing state with emerald styling
      expect(MascotAnimationState.answering.isProcessing, isTrue);
      expect(MascotAnimationState.answering.glowColor, equals(PixmintBotTheme.emeraldGlow));

      // Success uses radiant mint
      expect(MascotAnimationState.success.glowColor, equals(const Color(0xFF34D399)));
      expect(MascotAnimationState.success.baseGlowIntensity, equals(1.0));

      // Error uses amber warning with ruby accent
      expect(MascotAnimationState.error.isError, isTrue);
      expect(MascotAnimationState.error.glowColor, equals(const Color(0xFFF59E0B)));
      expect(MascotAnimationState.error.accentColor, equals(const Color(0xFFEF4444)));

      // Offline truthfully reduces eye brightness and flags isOffline
      expect(MascotAnimationState.offline.isOffline, isTrue);
      expect(MascotAnimationState.offline.glowColor, equals(const Color(0xFF64748B)));
      expect(MascotAnimationState.offline.baseGlowIntensity, equals(0.25));
    });

    // ── 2. Vector CustomPainter Rendering ───────────────────────────────────
    test('3. PixmintMascotPainter instantiates and calculates shouldRepaint cleanly', () {
      final painter1 = PixmintMascotPainter(
        state: MascotAnimationState.idle,
        eyeGlowProgress: 0.8,
        blinkProgress: 0.0,
      );

      final painter2 = PixmintMascotPainter(
        state: MascotAnimationState.idle,
        eyeGlowProgress: 0.8,
        blinkProgress: 0.0,
      );

      final painterChangedState = PixmintMascotPainter(
        state: MascotAnimationState.thinking,
        eyeGlowProgress: 0.8,
        blinkProgress: 0.0,
      );

      final painterBlinking = PixmintMascotPainter(
        state: MascotAnimationState.idle,
        eyeGlowProgress: 0.8,
        blinkProgress: 0.5,
      );

      expect(painter1.shouldRepaint(painter2), isFalse);
      expect(painter1.shouldRepaint(painterChangedState), isTrue);
      expect(painter1.shouldRepaint(painterBlinking), isTrue);
    });

    testWidgets('4. PixmintMascotPainter renders all 7 states without throwing', (tester) async {
      for (final state in MascotAnimationState.values) {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Center(
                child: CustomPaint(
                  size: const Size(100, 100),
                  painter: PixmintMascotPainter(
                    state: state,
                    showOrbitalRing: true,
                    showSatelliteDot: true,
                    useFullMascot: true,
                    eyeGlowProgress: 0.9,
                    blinkProgress: 0.2,
                    visorScanProgress: 0.5,
                  ),
                ),
              ),
            ),
          ),
        );

        expect(tester.takeException(), isNull);
      }
    });

    // ── 3. PixmintRobotAvatar Widget Tests ──────────────────────────────────
    testWidgets('5. PixmintRobotAvatar renders without clipping or overflow', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: Center(
              child: PixmintRobotAvatar(
                size: 64,
                showOrbitalRing: true,
                showSatelliteDot: true,
                useFullMascot: true,
              ),
            ),
          ),
        ),
      );

      expect(find.byType(PixmintRobotAvatar), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('6. PixmintRobotAvatar handles onTap callback', (tester) async {
      var tapped = false;

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Center(
              child: PixmintRobotAvatar(
                size: 48,
                onTap: () => tapped = true,
              ),
            ),
          ),
        ),
      );

      await tester.tap(find.byType(PixmintRobotAvatar));
      expect(tapped, isTrue);
    });

    // ── 4. PixmintLivingMascot Widget Tests ─────────────────────────────────
    testWidgets('7. PixmintLivingMascot renders with status badge and handles states', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: Center(
              child: PixmintLivingMascot(
                size: 100,
                state: MascotAnimationState.thinking,
                statusBadgeText: 'Analyzing CAD Standards...',
              ),
            ),
          ),
        ),
      );

      expect(find.byType(PixmintLivingMascot), findsOneWidget);
      expect(find.text('Analyzing CAD Standards...'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    // ── 5. Chat Controller Lifecycle Integration ────────────────────────────
    test('8. Chat controller synchronizes mascotState with actual lifecycle', () async {
      final controller = PixmintChatController(repository, initialRole: BotUserRole.engineer);

      // Session starts with greeting then transitions to idle
      expect(controller.state.mascotState, equals(MascotAnimationState.greeting));
      await controller.initializeSession(BotUserRole.engineer);
      expect(controller.state.mascotState, equals(MascotAnimationState.idle));

      // Sending message transitions to thinking
      final sendFuture = controller.sendMessage('How do I review drawings?');
      expect(controller.state.mascotState, equals(MascotAnimationState.thinking));

      await sendFuture;

      // On response received, transitions to answering
      expect(controller.state.mascotState, equals(MascotAnimationState.answering));

      controller.dispose();
    });

    test('9. Chat controller handles error state transition truthfully', () async {
      final controller = PixmintChatController(repository, initialRole: BotUserRole.engineer);
      await controller.initializeSession(BotUserRole.engineer);

      repository.shouldSimulateFailure = true;
      await controller.sendMessage('Test failing prompt');

      expect(controller.state.mascotState, equals(MascotAnimationState.error));
      expect(controller.state.errorMessage, isNotNull);

      // Setting offline transitions to offline
      controller.setOffline(true);
      expect(controller.state.mascotState, equals(MascotAnimationState.offline));

      // Reconnecting returns to idle
      controller.setOffline(false);
      expect(controller.state.mascotState, equals(MascotAnimationState.idle));

      controller.dispose();
    });

    // ── 6. Accessibility & Reduced Motion ───────────────────────────────────
    testWidgets('10. PixmintRobotAvatar respects disableAnimations accessibility preference', (tester) async {
      await tester.pumpWidget(
        const MediaQuery(
          data: MediaQueryData(disableAnimations: true),
          child: MaterialApp(
            home: Scaffold(
              body: Center(
                child: PixmintRobotAvatar(
                  size: 48,
                  animate: true,
                ),
              ),
            ),
          ),
        ),
      );

      expect(find.byType(PixmintRobotAvatar), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });
}
