import 'dart:io';

import 'package:flutter/material.dart';

class BeforeAfterCompare extends StatefulWidget {
  final String beforePath;
  final String afterPath;

  const BeforeAfterCompare({
    super.key,
    required this.beforePath,
    required this.afterPath,
  });

  @override
  State<BeforeAfterCompare> createState() => _BeforeAfterCompareState();
}

class _BeforeAfterCompareState extends State<BeforeAfterCompare> {
  double position = 0.5;

  void _move(double dx, double width) {
    if (width <= 0) return;
    setState(() => position = (dx / width).clamp(0.0, 1.0));
  }

  @override
  Widget build(BuildContext context) => Column(
        children: [
          const Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [Text('原图'), Text('重绘结果')],
          ),
          const SizedBox(height: 6),
          Expanded(
            child: LayoutBuilder(
              builder: (context, constraints) => GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTapDown: (details) =>
                    _move(details.localPosition.dx, constraints.maxWidth),
                onHorizontalDragUpdate: (details) =>
                    _move(details.localPosition.dx, constraints.maxWidth),
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    Image.file(File(widget.afterPath), fit: BoxFit.contain),
                    ClipRect(
                      child: Align(
                        alignment: Alignment.centerLeft,
                        widthFactor: position,
                        child: SizedBox(
                          width: constraints.maxWidth,
                          height: constraints.maxHeight,
                          child: Image.file(
                            File(widget.beforePath),
                            fit: BoxFit.contain,
                          ),
                        ),
                      ),
                    ),
                    Positioned(
                      left: constraints.maxWidth * position - 1,
                      top: 0,
                      bottom: 0,
                      child: Container(width: 2, color: Colors.white),
                    ),
                    Positioned(
                      left: constraints.maxWidth * position - 16,
                      top: constraints.maxHeight / 2 - 16,
                      child: const CircleAvatar(
                        radius: 16,
                        child: Icon(Icons.compare_arrows, size: 18),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      );
}
