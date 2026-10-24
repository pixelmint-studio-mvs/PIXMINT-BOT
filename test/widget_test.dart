import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pixmint_bot/pixmint_bot.dart';

void main() {
  testWidgets('PixmintBotLauncher renders mascot and triggers tap callback',
      (WidgetTester tester) async {
    bool tapped = false;

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          pixmintRepositoryProvider.overrideWithValue(
            MockPixmintBotRepository(simulatedDelay: Duration.zero),
          ),
        ],
        child: MaterialApp(
          home: Scaffold(
            body: Center(
              child: PixmintBotLauncher(
                animate: false,
                onCustomTap: () {
                  tapped = true;
                },
              ),
            ),
          ),
        ),
      ),
    );

    await tester.pumpAndSettle();

    expect(find.byType(PixmintBotLauncher), findsOneWidget);
    expect(find.byType(PixmintRobotAvatar), findsOneWidget);

    await tester.tap(find.byType(PixmintBotLauncher));
    await tester.pumpAndSettle();

    expect(tapped, isTrue);
  });

  testWidgets('PixmintChatHeader renders role badge and title',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: PixmintChatHeader(
            role: BotUserRole.draughtsman,
            onClear: () {},
            onClose: () {},
          ),
        ),
      ),
    );

    expect(find.text('PIXMINT BOT'), findsOneWidget);
    expect(find.text('DRAUGHTSMAN'), findsOneWidget);
    expect(find.byIcon(Icons.refresh_rounded), findsOneWidget);
    expect(find.byIcon(Icons.close_rounded), findsOneWidget);
  });

  testWidgets('QuickActionChips renders chips and invokes callback on tap',
      (WidgetTester tester) async {
    ChatSuggestion? selectedSuggestion;

    const suggestions = [
      ChatSuggestion(
        id: '1',
        label: 'Upload CAD',
        prompt: 'How do I upload CAD drawings?',
        role: BotUserRole.draughtsman,
      ),
      ChatSuggestion(
        id: '2',
        label: 'Revisions',
        prompt: 'How to do revisions?',
        role: BotUserRole.draughtsman,
      ),
    ];

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: QuickActionChips(
            suggestions: suggestions,
            onSelected: (s) {
              selectedSuggestion = s;
            },
          ),
        ),
      ),
    );

    expect(find.text('Upload CAD'), findsOneWidget);
    expect(find.text('Revisions'), findsOneWidget);

    await tester.tap(find.text('Upload CAD'));
    await tester.pump();

    expect(selectedSuggestion, isNotNull);
    expect(selectedSuggestion!.label, equals('Upload CAD'));
  });

  testWidgets('ChatBubble displays user message with timestamp',
      (WidgetTester tester) async {
    final message = ChatMessage(
      id: '1',
      sessionId: 's',
      sender: MessageSender.user,
      content: 'Testing user message bubble',
      createdAt: DateTime(2026, 10, 22, 14, 30),
      status: MessageStatus.sent,
    );

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ChatBubble(message: message),
        ),
      ),
    );

    expect(find.text('Testing user message bubble'), findsOneWidget);
    expect(find.byIcon(Icons.done_all), findsOneWidget);
  });

  testWidgets('PixmintRobotAvatar renders with custom sizes without overflow',
      (WidgetTester tester) async {
    for (final size in [28.0, 38.0, 48.0, 64.0, 68.0]) {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Center(
              child: PixmintRobotAvatar(
                size: size,
                animate: false,
                showOrbitalRing: true,
              ),
            ),
          ),
        ),
      );

      final avatarFinder = find.byType(PixmintRobotAvatar);
      expect(avatarFinder, findsOneWidget);
      final renderBox = tester.renderObject<RenderBox>(avatarFinder);
      expect(renderBox.size.width, equals(size));
      expect(renderBox.size.height, equals(size));
    }
  });

  testWidgets('PixmintRobotAvatar uses BoxFit.contain and avoids clipping',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: Center(
            child: PixmintRobotAvatar(
              size: 48,
              animate: false,
              useFullMascot: true,
            ),
          ),
        ),
      ),
    );

    final imageFinder = find.byType(Image);
    expect(imageFinder, findsOneWidget);
    final imageWidget = tester.widget<Image>(imageFinder);
    expect(imageWidget.fit, equals(BoxFit.contain));
  });

  testWidgets('Bot ChatBubble renders PixmintRobotAvatar alongside bot response',
      (WidgetTester tester) async {
    final botMessage = ChatMessage(
      id: '2',
      sessionId: 's',
      sender: MessageSender.bot,
      content: "Hey! 👋 I'm PIXMINT BOT. What can I help you with in Archi Draft today?",
      createdAt: DateTime(2026, 10, 22, 14, 30),
      status: MessageStatus.sent,
      sources: const [],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ChatBubble(message: botMessage),
        ),
      ),
    );

    expect(find.text('PIXMINT BOT'), findsOneWidget);
    expect(find.textContaining("Hey! 👋 I'm PIXMINT BOT"), findsOneWidget);
    expect(find.byType(PixmintRobotAvatar), findsOneWidget);
  });
}
