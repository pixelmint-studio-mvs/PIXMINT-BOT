import '../models/bot_user_role.dart';
import '../models/chat_message.dart';
import '../models/chat_session.dart';
import '../models/chat_suggestion.dart';

/// Abstract repository defining the communication contract for PIXMINT BOT.
///
/// Implementations can be a local Mock repository (for standalone Phase 1 testing)
/// or an authenticated remote repository connecting to Archi Draft's Cloudflare Worker.
abstract class PixmintBotRepository {
  /// Initializes or retrieves an active chat session for the specified role.
  Future<ChatSession> getOrCreateSession({
    required BotUserRole role,
    String? existingSessionId,
  });

  /// Lists past sessions for the current user.
  Future<List<ChatSession>> listSessions();

  /// Loads the message history for a given session.
  Future<List<ChatMessage>> getMessages(String sessionId);

  /// Sends a user message to PIXMINT BOT and retrieves the response.
  Future<ChatMessage> sendMessage({
    required String sessionId,
    required String content,
    required BotUserRole role,
    Map<String, dynamic>? clientContext,
    List<ChatMessage>? history,
  });

  /// Retrieves role-aware suggestion chips to help the user get started.
  Future<List<ChatSuggestion>> getSuggestions(BotUserRole role);

  /// Clears or deletes a session.
  Future<void> clearSession(String sessionId);
}
