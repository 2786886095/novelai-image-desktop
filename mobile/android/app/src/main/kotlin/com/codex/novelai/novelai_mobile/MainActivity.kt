package com.codex.novelai.novelai_mobile

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
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

        // Lets the user store generated images in an arbitrary folder. On
        // Android 11+ that needs "All files access"; below 30 legacy storage
        // already grants broad write access.
        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            "langbai.novelai/storage",
        ).setMethodCallHandler { call, result ->
            when (call.method) {
                "isExternalStorageManager" -> {
                    val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                        Environment.isExternalStorageManager()
                    } else {
                        true
                    }
                    result.success(granted)
                }
                "requestExternalStorageManager" -> {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R &&
                        !Environment.isExternalStorageManager()
                    ) {
                        try {
                            startActivity(
                                Intent(
                                    Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
                                    Uri.parse("package:$packageName"),
                                ),
                            )
                        } catch (error: Exception) {
                            try {
                                startActivity(
                                    Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION),
                                )
                            } catch (ignored: Exception) {
                                // No settings activity available — nothing to open.
                            }
                        }
                    }
                    result.success(null)
                }
                else -> result.notImplemented()
            }
        }
    }
}
