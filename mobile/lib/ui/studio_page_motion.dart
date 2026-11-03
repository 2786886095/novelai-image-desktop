import 'package:flutter/material.dart';
import 'package:flutter/gestures.dart';
import 'studio_theme.dart';

/// Retains one element tree during both directions; never duplicates editors
/// like an AnimatedSwitcher can. Only the current page handles input/focus.
class StudioRetainedPageMotion extends StatefulWidget {
  final bool active;
  final bool reduceMotion;
  final bool fade;
  final Offset enterOffset;
  final Object? transitionId;
  final Widget child;
  const StudioRetainedPageMotion(
      {super.key,
      required this.active,
      this.reduceMotion = false,
      this.fade = true,
      this.enterOffset = const Offset(.10, 0),
      this.transitionId,
      required this.child});
  @override
  State<StudioRetainedPageMotion> createState() =>
      _StudioRetainedPageMotionState();
}

class _StudioRetainedPageMotionState extends State<StudioRetainedPageMotion>
    with SingleTickerProviderStateMixin {
  late final _controller = AnimationController(
      vsync: this,
      duration: AppMotion.slow,
      reverseDuration: const Duration(milliseconds: 200),
      value: widget.active ? 1 : 0);
  bool _reduce = false;
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _reduce = widget.reduceMotion || MediaQuery.disableAnimationsOf(context);
    if (_reduce) _controller.value = widget.active ? 1 : 0;
  }

  @override
  void didUpdateWidget(covariant StudioRetainedPageMotion oldWidget) {
    super.didUpdateWidget(oldWidget);
    _reduce = widget.reduceMotion || MediaQuery.disableAnimationsOf(context);
    if (_reduce) {
      _controller.value = widget.active ? 1 : 0;
      return;
    }
    if (oldWidget.active != widget.active) {
      widget.active ? _controller.forward() : _controller.reverse();
    } else if (widget.active && oldWidget.transitionId != widget.transitionId) {
      _controller.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
      animation: _controller,
      child: widget.child,
      builder: (context, child) {
        final progress = AppMotion.easeOut.transform(_controller.value);
        final visible = widget.active || _controller.isAnimating;
        return Offstage(
            offstage: !visible,
            child: IgnorePointer(
                ignoring: !widget.active,
                child: ExcludeFocus(
                    excluding: !widget.active,
                    child: ExcludeSemantics(
                        excluding: !widget.active,
                        child: TickerMode(
                            enabled: visible,
                            child: FractionalTranslation(
                                translation:
                                    widget.enterOffset * (1 - progress),
                                child: Opacity(
                                    opacity: widget.fade ? progress : 1,
                                    child: child)))))));
      });
}

/// Pointer-down feedback stays visible above opaque card content and starts
/// before InkWell's tap-recognition delay. Scrolling/cancellation never invokes
/// actions; the existing button/ListTile still owns gesture recognition.
class StudioPressFeedback extends StatefulWidget {
  final Widget child;
  final bool reduceMotion;
  const StudioPressFeedback(
      {super.key, required this.child, this.reduceMotion = false});
  @override
  State<StudioPressFeedback> createState() => _StudioPressFeedbackState();
}

class _StudioPressFeedbackState extends State<StudioPressFeedback> {
  bool _pressed = false;
  int? _pointer;
  Offset? _origin;
  void _set(bool value) {
    if (_pressed != value) setState(() => _pressed = value);
  }

  @override
  Widget build(BuildContext context) => Listener(
      onPointerDown: (event) {
        if (_pointer != null) return;
        _pointer = event.pointer;
        _origin = event.position;
        _set(true);
      },
      onPointerMove: (event) {
        if (event.pointer == _pointer &&
            (event.position - _origin!).distance > kTouchSlop) _set(false);
      },
      onPointerUp: (event) {
        if (event.pointer == _pointer) {
          _pointer = null;
          _set(false);
        }
      },
      onPointerCancel: (event) {
        if (event.pointer == _pointer) {
          _pointer = null;
          _set(false);
        }
      },
      child: Stack(children: [
        widget.child,
        Positioned.fill(
            child: IgnorePointer(
                child: AnimatedOpacity(
          opacity: _pressed ? 1 : 0,
          duration:
              widget.reduceMotion || MediaQuery.disableAnimationsOf(context)
                  ? Duration.zero
                  : AppMotion.fast,
          child: ColoredBox(
              color: Theme.of(context).colorScheme.primary.withOpacity(.08)),
        ))),
      ]));
}
