import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../data/repositories/archi_draft_pixmint_bot_repository.dart';
import '../data/repositories/mock_pixmint_bot_repository.dart';
import '../domain/models/bot_user_role.dart';
import '../domain/models/chat_suggestion.dart';
import '../domain/models/pixmint_default_suggestions.dart';
import '../domain/repositories/pixmint_bot_repository.dart';
import 'pixmint_chat_controller.dart';

/// Base URL for the production Archi Draft Cloudflare Worker API.
final pixmintApiBaseUrlProvider = StateProvider<String>((ref) {
  return const String.fromEnvironment(
    'PIXMINT_API_BASE_URL',
    defaultValue: 'https://api.pixelmint.studio',
  );
});

/// Firebase Auth Bearer token provider for authenticated requests.
final pixmintAuthTokenProvider = StateProvider<String?>((ref) {
  return null;
});

/// Controls whether PIXMINT BOT connects to the remote Worker API or local verified engine.
final pixmintUseRemoteProvider = StateProvider<bool>((ref) {
  return const bool.fromEnvironment(
    'PIXMINT_USE_REMOTE',
    defaultValue: false,
  );
});

/// Provider for the [PixmintBotRepository].
///
/// Defaults to [MockPixmintBotRepository] with local grounded synthesis, or switches
/// to [ArchiDraftPixmintBotRepository] when remote mode is enabled.
final pixmintRepositoryProvider = Provider<PixmintBotRepository>((ref) {
  final useRemote = ref.watch(pixmintUseRemoteProvider);
  if (useRemote) {
    final baseUrl = ref.watch(pixmintApiBaseUrlProvider);
    final token = ref.watch(pixmintAuthTokenProvider);
    return ArchiDraftPixmintBotRepository(
      baseUrl: baseUrl,
      authTokenGetter: () async => token,
    );
  }
  return MockPixmintBotRepository();
});

/// The active user role driving PIXMINT BOT context and suggestions.
final pixmintRoleProvider = StateProvider<BotUserRole>((ref) {
  return BotUserRole.engineer;
});

/// Suggestions provider tailored to the current role.
///
/// Ensures suggestions are immediately available from [PixmintDefaultSuggestions],
/// and falls back gracefully to local defaults if the repository call fails or returns empty.
final pixmintSuggestionsProvider = FutureProvider<List<ChatSuggestion>>((ref) async {
  final repository = ref.watch(pixmintRepositoryProvider);
  final role = ref.watch(pixmintRoleProvider);
  try {
    final suggestions = await repository.getSuggestions(role);
    if (suggestions.isNotEmpty) return suggestions;
  } catch (_) {}
  return PixmintDefaultSuggestions.getForRole(role);
});

/// Main controller managing chat conversation state.
final pixmintChatControllerProvider =
    StateNotifierProvider<PixmintChatController, PixmintChatState>((ref) {
  final repository = ref.watch(pixmintRepositoryProvider);
  final role = ref.watch(pixmintRoleProvider);
  return PixmintChatController(repository, initialRole: role);
});
