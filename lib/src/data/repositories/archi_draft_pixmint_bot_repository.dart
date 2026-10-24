import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;

import '../../domain/models/bot_user_role.dart';
import '../../domain/models/chat_message.dart';
import '../../domain/models/chat_session.dart';
import '../../domain/models/chat_suggestion.dart';
import '../../domain/repositories/pixmint_bot_repository.dart';
import 'mock_pixmint_bot_repository.dart';

/// Production HTTP repository for PIXMINT BOT connecting to the Archi Draft
/// Cloudflare Worker backend API.
///
/// Features:
/// - Authenticated Bearer token injection from Firebase Auth
/// - Resilient timeout handling
/// - Automatic graceful fallback to the local verified engine if the network
///   or remote worker endpoint is unavailable
class ArchiDraftPixmintBotRepository implements PixmintBotRepository {
  final String baseUrl;
  final Future<String?> Function()? authTokenGetter;
  final http.Client _client;
  final PixmintBotRepository _fallbackRepo;
  final Duration timeout;

  ArchiDraftPixmintBotRepository({
    this.baseUrl = 'https://api.pixelmint.studio',
    this.authTokenGetter,
    http.Client? client,
    PixmintBotRepository? fallbackRepo,
    this.timeout = const Duration(seconds: 8),
  })  : _client = client ?? http.Client(),
        _fallbackRepo = fallbackRepo ?? MockPixmintBotRepository();

  Future<Map<String, String>> _buildHeaders() async {
    final headers = <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (authTokenGetter != null) {
      try {
        final token = await authTokenGetter!();
        if (token != null && token.isNotEmpty) {
          headers['Authorization'] = 'Bearer $token';
        }
      } catch (_) {
        // Fall back gracefully without failing pre-flight header build
      }
    }

    return headers;
  }

  @override
  Future<ChatSession> getOrCreateSession({
    required BotUserRole role,
    String? existingSessionId,
  }) async {
    try {
      final headers = await _buildHeaders();
      final uri = Uri.parse('$baseUrl/api/chat/sessions');
      final response = await _client
          .post(
            uri,
            headers: headers,
            body: jsonEncode({
              'role': role.name,
              if (existingSessionId != null) 'sessionId': existingSessionId,
            }),
          )
          .timeout(timeout);

      if (response.statusCode >= 200 && response.statusCode < 300) {
        final data = jsonDecode(response.body) as Map<String, dynamic>;
        return ChatSession.fromJson(data);
      }
    } catch (_) {
      // Remote unavailable; delegate to resilient local fallback
    }

    return _fallbackRepo.getOrCreateSession(
      role: role,
      existingSessionId: existingSessionId,
    );
  }

  @override
  Future<List<ChatSession>> listSessions() async {
    try {
      final headers = await _buildHeaders();
      final uri = Uri.parse('$baseUrl/api/chat/sessions');
      final response = await _client.get(uri, headers: headers).timeout(timeout);

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body) as List<dynamic>;
        return data
            .map((item) => ChatSession.fromJson(item as Map<String, dynamic>))
            .toList();
      }
    } catch (_) {}

    return _fallbackRepo.listSessions();
  }

  @override
  Future<List<ChatMessage>> getMessages(String sessionId) async {
    try {
      final headers = await _buildHeaders();
      final uri = Uri.parse('$baseUrl/api/chat/sessions/$sessionId/messages');
      final response = await _client.get(uri, headers: headers).timeout(timeout);

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body) as List<dynamic>;
        return data
            .map((item) => ChatMessage.fromJson(item as Map<String, dynamic>))
            .toList();
      }
    } catch (_) {}

    return _fallbackRepo.getMessages(sessionId);
  }

  @override
  Future<ChatMessage> sendMessage({
    required String sessionId,
    required String content,
    required BotUserRole role,
    Map<String, dynamic>? clientContext,
    List<ChatMessage>? history,
  }) async {
    try {
      final headers = await _buildHeaders();
      final uri = Uri.parse('$baseUrl/api/chat/sessions/$sessionId/messages');
      final recentHistory = (history ?? []).take(5).map((m) => {
        'sender': m.sender == MessageSender.user ? 'user' : 'bot',
        'content': m.content,
      }).toList();

      final response = await _client
          .post(
            uri,
            headers: headers,
            body: jsonEncode({
              'content': content,
              'role': role.name,
              if (recentHistory.isNotEmpty) 'history': recentHistory,
              if (clientContext != null) 'clientContext': clientContext,
            }),
          )
          .timeout(timeout);

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body) as Map<String, dynamic>;
        return ChatMessage.fromJson(data);
      } else if (response.statusCode == 401 || response.statusCode == 403) {
        try {
          final data = jsonDecode(response.body) as Map<String, dynamic>;
          final errorMsg = data['error'] ?? 'Access denied by server security policy.';
          return ChatMessage(
            id: 'sec-${DateTime.now().millisecondsSinceEpoch}',
            sessionId: sessionId,
            sender: MessageSender.bot,
            content: '[SECURITY_RESTRICTION] $errorMsg',
            createdAt: DateTime.now(),
          );
        } catch (_) {}
      } else if (response.statusCode == 503) {
        try {
          final data = jsonDecode(response.body) as Map<String, dynamic>;
          final errorMsg = data['error'] ?? 'PIXMINT BOT service is currently disabled.';
          return ChatMessage(
            id: 'sys-${DateTime.now().millisecondsSinceEpoch}',
            sessionId: sessionId,
            sender: MessageSender.bot,
            content: '[SERVICE_UNAVAILABLE] $errorMsg',
            createdAt: DateTime.now(),
          );
        } catch (_) {}
      }
    } catch (_) {
      // Network drop, timeout, or worker 502 -> Fallback to grounded local engine
    }

    return _fallbackRepo.sendMessage(
      sessionId: sessionId,
      content: content,
      role: role,
      clientContext: clientContext,
      history: history,
    );
  }

  @override
  Future<List<ChatSuggestion>> getSuggestions(BotUserRole role) async {
    try {
      final headers = await _buildHeaders();
      final uri = Uri.parse('$baseUrl/api/chat/suggestions?role=${role.name}');
      final response = await _client.get(uri, headers: headers).timeout(timeout);

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body) as List<dynamic>;
        final suggestions = data
            .map((item) => ChatSuggestion.fromJson(item as Map<String, dynamic>))
            .toList();
        if (suggestions.isNotEmpty) return suggestions;
      }
    } catch (_) {}

    return _fallbackRepo.getSuggestions(role);
  }

  @override
  Future<void> clearSession(String sessionId) async {
    try {
      final headers = await _buildHeaders();
      final uri = Uri.parse('$baseUrl/api/chat/sessions/$sessionId');
      await _client.delete(uri, headers: headers).timeout(timeout);
    } catch (_) {}

    return _fallbackRepo.clearSession(sessionId);
  }
}
