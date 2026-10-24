import 'package:flutter_test/flutter_test.dart';
import 'package:pixmint_bot/pixmint_bot.dart';

void main() {
  group('MockPixmintBotRepository Tests', () {
    late MockPixmintBotRepository repository;

    setUp(() {
      repository = MockPixmintBotRepository(
        simulatedDelay: Duration.zero, // Instant for fast testing
      );
    });

    test('Initializes session with welcome message tailored to role', () async {
      final engSession = await repository.getOrCreateSession(role: BotUserRole.engineer);
      expect(engSession.role, equals(BotUserRole.engineer));
      expect(engSession.messages.length, equals(1));
      expect(engSession.messages.first.content.contains('Engineer'), isTrue);

      final stuSession = await repository.getOrCreateSession(role: BotUserRole.student);
      expect(stuSession.role, equals(BotUserRole.student));
      expect(stuSession.messages.first.content.contains('Student'), isTrue);
    });

    test('Sends user message and generates bot response with sources', () async {
      final session = await repository.getOrCreateSession(role: BotUserRole.draughtsman);
      final response = await repository.sendMessage(
        sessionId: session.id,
        content: 'What are the CAD file requirements?',
        role: BotUserRole.draughtsman,
      );

      expect(response.isBot, isTrue);
      expect(response.content.contains('.dwg'), isTrue);
      expect(response.sources.isNotEmpty, isTrue);

      final history = await repository.getMessages(session.id);
      expect(history.length, equals(3)); // Welcome + User + Bot
    });

    test('Retrieves role-specific suggestion chips', () async {
      final engSuggestions = await repository.getSuggestions(BotUserRole.engineer);
      expect(engSuggestions.length, equals(8));
      expect(engSuggestions.every((s) => s.role == BotUserRole.engineer), isTrue);

      final dftSuggestions = await repository.getSuggestions(BotUserRole.draughtsman);
      expect(dftSuggestions.length, equals(8));
      expect(dftSuggestions.every((s) => s.role == BotUserRole.draughtsman), isTrue);

      final stuSuggestions = await repository.getSuggestions(BotUserRole.student);
      expect(stuSuggestions.length, equals(8));
      expect(stuSuggestions.any((s) => s.label.toLowerCase().contains('training modules')), isTrue);

      final admSuggestions = await repository.getSuggestions(BotUserRole.admin);
      expect(admSuggestions.length, equals(7));
      expect(admSuggestions.every((s) => s.role == BotUserRole.admin), isTrue);
    });

    test('Simulates failure when shouldSimulateFailure is set', () async {
      final session = await repository.getOrCreateSession(role: BotUserRole.engineer);
      repository.shouldSimulateFailure = true;

      expect(
        () => repository.sendMessage(
          sessionId: session.id,
          content: 'Will this fail?',
          role: BotUserRole.engineer,
        ),
        throwsA(isA<Exception>()),
      );
    });

    test('Clears session and message history', () async {
      final session = await repository.getOrCreateSession(role: BotUserRole.engineer);
      await repository.clearSession(session.id);

      final messages = await repository.getMessages(session.id);
      expect(messages, isEmpty);
    });
  });
}
