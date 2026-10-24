import 'package:flutter_test/flutter_test.dart';
import 'package:pixmint_bot/pixmint_bot.dart';

void main() {
  group('BotUserRole Tests', () {
    test('Correctly maps strings to BotUserRole enum', () {
      expect(BotUserRole.fromString('CLIENT'), equals(BotUserRole.guest)); // Unsupported role safely falls back to guest
      expect(BotUserRole.fromString('ENGINEER'), equals(BotUserRole.engineer));
      expect(BotUserRole.fromString('DRAUGHTSMAN'), equals(BotUserRole.draughtsman));
      expect(BotUserRole.fromString('STUDENT'), equals(BotUserRole.student));
      expect(BotUserRole.fromString('ADMIN'), equals(BotUserRole.admin));
      expect(BotUserRole.fromString('STUDIO_ADMIN'), equals(BotUserRole.admin));
      expect(BotUserRole.fromString('UNKNOWN'), equals(BotUserRole.guest));
      expect(BotUserRole.fromString(null), equals(BotUserRole.guest));
    });

    test('Provides correct display names', () {
      expect(BotUserRole.engineer.displayName, equals('Engineer'));
      expect(BotUserRole.draughtsman.displayName, equals('Draughtsman'));
      expect(BotUserRole.student.displayName, equals('Student'));
      expect(BotUserRole.admin.displayName, equals('Studio Admin'));
      expect(BotUserRole.guest.displayName, equals('Guest'));
    });
  });

  group('ChatMessage Tests', () {
    test('Instantiates and identifies sender correctly', () {
      final userMsg = ChatMessage(
        id: 'msg_1',
        sessionId: 'sess_1',
        sender: MessageSender.user,
        content: 'Hello bot',
        createdAt: DateTime(2026, 10, 22),
      );

      expect(userMsg.isUser, isTrue);
      expect(userMsg.isBot, isFalse);
      expect(userMsg.isSystem, isFalse);
      expect(userMsg.hasError, isFalse);

      final botMsg = userMsg.copyWith(
        sender: MessageSender.bot,
        status: MessageStatus.sent,
        sources: [
          const ChatSource(title: 'Guidelines', docRef: 'docs/test.md'),
        ],
      );

      expect(botMsg.isBot, isTrue);
      expect(botMsg.isUser, isFalse);
      expect(botMsg.sources.length, equals(1));
      expect(botMsg.sources.first.docRef, equals('docs/test.md'));
    });

    test('ChatSource serialization works', () {
      const source = ChatSource(title: 'Master Instructions', docRef: 'sec_1');
      final json = source.toJson();
      expect(json['title'], equals('Master Instructions'));
      expect(json['docRef'], equals('sec_1'));

      final restored = ChatSource.fromJson(json);
      expect(restored.title, equals('Master Instructions'));
      expect(restored.docRef, equals('sec_1'));
    });
  });

  group('ChatSuggestion Tests', () {
    test('ChatSuggestion serializes and deserializes', () {
      const suggestion = ChatSuggestion(
        id: 'sug_1',
        label: 'Upload CAD',
        prompt: 'How do I upload a CAD drawing?',
        role: BotUserRole.draughtsman,
      );

      final json = suggestion.toJson();
      expect(json['id'], equals('sug_1'));
      expect(json['role'], equals('draughtsman'));

      final fromJson = ChatSuggestion.fromJson(json);
      expect(fromJson.id, equals('sug_1'));
      expect(fromJson.role, equals(BotUserRole.draughtsman));
      expect(fromJson.label, equals('Upload CAD'));
    });
  });
}
