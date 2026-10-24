/// PIXMINT BOT — Smart AI Companion for Archi Draft.
///
/// An intelligent, reusable AI chatbot module developed independently
/// by PixelMint Studio MVS.
library pixmint_bot;

// Theme
export 'src/theme/pixmint_bot_theme.dart';

// Domain Models & Repository Interface
export 'src/domain/models/bot_user_role.dart';
export 'src/domain/models/chat_message.dart';
export 'src/domain/models/chat_session.dart';
export 'src/domain/models/chat_suggestion.dart';
export 'src/domain/models/pixmint_default_suggestions.dart';
export 'src/domain/repositories/pixmint_bot_repository.dart';
export 'src/domain/engine/pixmint_knowledge_engine.dart';

// Data & Implementations
export 'src/data/repositories/mock_pixmint_bot_repository.dart';
export 'src/data/repositories/archi_draft_pixmint_bot_repository.dart';

// Riverpod Providers & Controller
export 'src/providers/pixmint_bot_providers.dart';
export 'src/providers/pixmint_chat_controller.dart';

// Presentation Widgets & Animation
export 'src/presentation/animation/mascot_animation_state.dart';
export 'src/presentation/launcher/pixmint_bot_launcher.dart';
export 'src/presentation/launcher/pixmint_mascot_painter.dart';
export 'src/presentation/widgets/pixmint_living_mascot.dart';
export 'src/presentation/sheet/pixmint_chat_sheet.dart';
export 'src/presentation/sheet/pixmint_chat_header.dart';
export 'src/presentation/sheet/pixmint_chat_input.dart';
export 'src/presentation/widgets/chat_bubble.dart';
export 'src/presentation/widgets/quick_action_chips.dart';
export 'src/presentation/widgets/typing_indicator.dart';
export 'src/presentation/widgets/error_retry_banner.dart';
