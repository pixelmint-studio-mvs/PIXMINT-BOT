import 'package:flutter_test/flutter_test.dart';
import 'package:pixmint_bot/pixmint_bot.dart';

void main() {
  group('PixmintChatController Tests', () {
    late MockPixmintBotRepository repository;

    setUp(() {
      repository = MockPixmintBotRepository(simulatedDelay: Duration.zero);
    });

    test('Initializes with welcome message and active session', () async {
      final controller = PixmintChatController(repository, initialRole: BotUserRole.engineer);
      await controller.initializeSession(BotUserRole.engineer);

      expect(controller.state.hasActiveSession, isTrue);
      expect(controller.state.role, equals(BotUserRole.engineer));
      expect(controller.state.messages.length, equals(1));
      expect(controller.state.messages.first.isBot, isTrue);
      controller.dispose();
    });

    test('Sends message successfully and updates state', () async {
      final controller = PixmintChatController(repository, initialRole: BotUserRole.engineer);
      await controller.initializeSession(BotUserRole.engineer);

      await controller.sendMessage('How do I review drawings?');

      expect(controller.state.messages.length, equals(3)); // Welcome + User + Bot
      expect(controller.state.messages[1].isUser, isTrue);
      expect(controller.state.messages[1].status, equals(MessageStatus.sent));
      expect(controller.state.messages[2].isBot, isTrue);
      expect(controller.state.isThinking, isFalse);
      controller.dispose();
    });

    test('Handles delivery failure and provides retry capability', () async {
      final controller = PixmintChatController(repository, initialRole: BotUserRole.engineer);
      await controller.initializeSession(BotUserRole.engineer);

      repository.shouldSimulateFailure = true;
      await controller.sendMessage('This message will fail');

      expect(controller.state.isThinking, isFalse);
      expect(controller.state.errorMessage, isNotNull);
      expect(controller.state.messages.last.status, equals(MessageStatus.error));

      // Resolve failure and retry
      repository.shouldSimulateFailure = false;
      await controller.retryLastMessage();

      expect(controller.state.errorMessage, isNull);
      expect(controller.state.messages.last.isBot, isTrue);
      controller.dispose();
    });

    test('Switches role and reinitializes session', () async {
      final controller = PixmintChatController(repository, initialRole: BotUserRole.engineer);
      await controller.initializeSession(BotUserRole.engineer);
      expect(controller.state.role, equals(BotUserRole.engineer));

      await controller.switchRole(BotUserRole.student);

      expect(controller.state.role, equals(BotUserRole.student));
      expect(controller.state.messages.first.content.contains('Student'), isTrue);
      controller.dispose();
    });

    test('Clears conversation cleanly', () async {
      final controller = PixmintChatController(repository, initialRole: BotUserRole.engineer);
      await controller.initializeSession(BotUserRole.engineer);
      await controller.sendMessage('Some query');
      expect(controller.state.messages.length, equals(3));

      await controller.clearConversation();

      // Should be back to 1 welcome message
      expect(controller.state.messages.length, equals(1));
      controller.dispose();
    });
  });
}
