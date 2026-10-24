import 'package:flutter/material.dart';

import '../../theme/pixmint_bot_theme.dart';

/// Text input bar for composing messages to PIXMINT BOT.
///
/// Faithfully reproduces the official chat mockup:
/// - Dark rounded capsule container
/// - "Ask a question..." placeholder
/// - Vibrant mint-emerald send button with dark arrow
class PixmintChatInput extends StatefulWidget {
  final ValueChanged<String> onSend;
  final bool isThinking;
  final int maxLength;

  const PixmintChatInput({
    super.key,
    required this.onSend,
    this.isThinking = false,
    this.maxLength = 1000,
  });

  @override
  State<PixmintChatInput> createState() => _PixmintChatInputState();
}

class _PixmintChatInputState extends State<PixmintChatInput> {
  final TextEditingController _textController = TextEditingController();
  final FocusNode _focusNode = FocusNode();
  int _charCount = 0;

  @override
  void initState() {
    super.initState();
    _textController.addListener(_onTextChanged);
  }

  @override
  void didUpdateWidget(covariant PixmintChatInput oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.isThinking && !widget.isThinking) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          _focusNode.requestFocus();
        }
      });
    }
  }

  void _onTextChanged() {
    setState(() {
      _charCount = _textController.text.length;
    });
  }

  void _submit() {
    final text = _textController.text.trim();
    if (text.isEmpty || widget.isThinking) return;

    widget.onSend(text);
    _textController.clear();
    _charCount = 0;
    _focusNode.requestFocus();
  }

  @override
  void dispose() {
    _textController.removeListener(_onTextChanged);
    _textController.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final canSend = _charCount > 0 && !widget.isThinking;

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: PixmintBotTheme.spacingMd,
        vertical: PixmintBotTheme.spacingSm,
      ),
      decoration: BoxDecoration(
        color: PixmintBotTheme.surfaceCard,
        border: Border(
          top: BorderSide(
            color: Colors.white.withValues(alpha: 0.06),
            width: 1,
          ),
        ),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                // Input Capsule
                Expanded(
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () => _focusNode.requestFocus(),
                    child: Container(
                      decoration: BoxDecoration(
                        color: const Color(0xFF081824),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: _focusNode.hasFocus
                              ? PixmintBotTheme.emeraldGlow
                              : Colors.white.withValues(alpha: 0.10),
                          width: 1.2,
                        ),
                      ),
                      child: TextField(
                        controller: _textController,
                        focusNode: _focusNode,
                        maxLines: 4,
                        minLines: 1,
                        maxLength: widget.maxLength,
                        textInputAction: TextInputAction.send,
                        buildCounter: (
                          _, {
                          required currentLength,
                          required isFocused,
                          maxLength,
                        }) =>
                            null,
                        style: const TextStyle(
                          color: PixmintBotTheme.textPrimary,
                          fontSize: 14,
                        ),
                        decoration: const InputDecoration(
                          hintText: 'Ask a question...',
                          hintStyle: TextStyle(
                            color: Color(0xFF64748B),
                            fontSize: 13.5,
                          ),
                          border: InputBorder.none,
                          contentPadding: EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 12,
                          ),
                        ),
                        onSubmitted: (_) => _submit(),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: PixmintBotTheme.spacingSm),

                // Vibrant Mint Send Button (Rounded Rectangle from Mockup)
                AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    gradient: canSend
                        ? const LinearGradient(
                            colors: [
                              Color(0xFF00F2A9),
                              Color(0xFF10B981),
                            ],
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                          )
                        : null,
                    color: canSend ? null : const Color(0xFF162D3D),
                    borderRadius: BorderRadius.circular(14),
                    boxShadow: canSend
                        ? [
                            BoxShadow(
                              color: PixmintBotTheme.emeraldGlow.withValues(
                                alpha: 0.45,
                              ),
                              blurRadius: 10,
                              offset: const Offset(0, 3),
                            ),
                          ]
                        : null,
                  ),
                  child: IconButton(
                    icon: widget.isThinking
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.black,
                            ),
                          )
                        : Icon(
                            Icons.send_rounded,
                            color: canSend
                                ? const Color(0xFF07141E)
                                : const Color(0xFF64748B),
                            size: 20,
                          ),
                    onPressed: canSend ? _submit : null,
                  ),
                ),
              ],
            ),
            if (_charCount > widget.maxLength * 0.8)
              Padding(
                padding: const EdgeInsets.only(top: 4, right: 8),
                child: Align(
                  alignment: Alignment.centerRight,
                  child: Text(
                    '$_charCount / ${widget.maxLength}',
                    style: TextStyle(
                      color: _charCount >= widget.maxLength
                          ? PixmintBotTheme.error
                          : PixmintBotTheme.textMuted,
                      fontSize: 10,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
