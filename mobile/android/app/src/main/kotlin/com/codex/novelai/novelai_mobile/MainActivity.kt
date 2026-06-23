package com.codex.novelai.novelai_mobile

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.nio.charset.Charset

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            "langbai.novelai/native_text",
        ).setMethodCallHandler { call, result ->
            when (call.method) {
                "decodeGbk" -> {
                    val bytes = call.arguments as? ByteArray
                    if (bytes == null) {
                        result.error("invalid_bytes", "GBK input is not a byte array", null)
                    } else {
                        try {
                            result.success(String(bytes, Charset.forName("GBK")))
                        } catch (error: Exception) {
                            result.error("gbk_decode_failed", error.message, null)
                        }
                    }
                }
                else -> result.notImplemented()
            }
        }
    }
}
