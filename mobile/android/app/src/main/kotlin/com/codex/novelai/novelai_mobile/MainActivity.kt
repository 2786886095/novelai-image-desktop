package com.codex.novelai.novelai_mobile

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.OpenableColumns
import android.provider.Settings
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.net.InetSocketAddress
import java.net.Proxy
import java.net.ProxySelector
import java.net.URI
import java.nio.charset.Charset
import java.util.ArrayDeque
import java.util.UUID

class MainActivity : FlutterActivity() {
    companion object {
        private const val INCOMING_BACKUP_PENDING = "__incoming_backup_pending__"
    }

    private var incomingBackupChannel: MethodChannel? = null
    private val pendingIncomingBackups = ArrayDeque<String>()
    private var incomingBackupCopiesInProgress = 0

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        incomingBackupChannel = MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            "langbai.novelai/incoming_backup",
        ).also { channel ->
            channel.setMethodCallHandler { call, result ->
                when (call.method) {
                    "takeInitialBackup" -> result.success(
                        if (pendingIncomingBackups.isNotEmpty()) {
                            pendingIncomingBackups.removeFirst()
                        } else if (incomingBackupCopiesInProgress > 0) {
                            INCOMING_BACKUP_PENDING
                        } else {
                            null
                        },
                    )
                    else -> result.notImplemented()
                }
            }
        }
        handleIncomingBackupIntent(intent)

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

        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            "langbai.novelai/network",
        ).setMethodCallHandler { call, result ->
            when (call.method) {
                "resolveProxy" -> {
                    val target = call.arguments as? String ?: "https://api.novelai.net"
                    try {
                        val proxy = ProxySelector.getDefault()
                            ?.select(URI(target))
                            ?.firstOrNull { it.type() != Proxy.Type.DIRECT }
                        val address = proxy?.address() as? InetSocketAddress
                        if (proxy == null || address == null) {
                            result.success("")
                        } else {
                            val scheme = if (proxy.type() == Proxy.Type.SOCKS) "socks5" else "http"
                            val host = if (address.hostString.contains(":")) "[${address.hostString}]" else address.hostString
                            result.success("$scheme://$host:${address.port}")
                        }
                    } catch (error: Exception) {
                        result.success("")
                    }
                }
                else -> result.notImplemented()
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIncomingBackupIntent(intent)
    }

    private fun handleIncomingBackupIntent(sourceIntent: Intent?) {
        val source = sourceIntent ?: return
        val uri = incomingBackupUri(source) ?: return
        val providedMimeType = source.type
        clearConsumedIncomingIntent(source)
        incomingBackupCopiesInProgress++
        Thread {
            val path = try {
                val originalName = displayName(uri)
                if (isBackupCandidate(providedMimeType, uri, originalName)) {
                    copyIncomingBackup(uri, originalName)
                } else {
                    null
                }
            } catch (_: Exception) {
                null
            }
            runOnUiThread {
                incomingBackupCopiesInProgress =
                    (incomingBackupCopiesInProgress - 1).coerceAtLeast(0)
                if (path == null) {
                    incomingBackupChannel?.invokeMethod("backupReceiveFinished", null)
                    return@runOnUiThread
                }
                pendingIncomingBackups.addLast(path)
                incomingBackupChannel?.invokeMethod(
                    "backupReceived",
                    path,
                    object : MethodChannel.Result {
                        override fun success(result: Any?) {
                            pendingIncomingBackups.remove(path)
                        }

                        override fun error(
                            errorCode: String,
                            errorMessage: String?,
                            errorDetails: Any?,
                        ) = Unit

                        override fun notImplemented() = Unit
                    },
                )
            }
        }.start()
    }

    private fun incomingBackupUri(source: Intent): Uri? {
        return when (source.action) {
            Intent.ACTION_VIEW -> source.data
            Intent.ACTION_SEND -> streamUri(source)
                ?: source.clipData?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.uri
            Intent.ACTION_SEND_MULTIPLE -> streamUris(source).firstOrNull()
                ?: source.clipData?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.uri
            else -> null
        }
    }

    @Suppress("DEPRECATION")
    private fun streamUri(source: Intent): Uri? {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            source.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
        } else {
            source.getParcelableExtra(Intent.EXTRA_STREAM) as? Uri
        }
    }

    @Suppress("DEPRECATION")
    private fun streamUris(source: Intent): List<Uri> {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            source.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
                ?: emptyList()
        } else {
            source.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)
                ?: emptyList()
        }
    }

    private fun displayName(uri: Uri): String? {
        if (uri.scheme == "content") {
            contentResolver.query(
                uri,
                arrayOf(OpenableColumns.DISPLAY_NAME),
                null,
                null,
                null,
            )?.use { cursor ->
                val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (index >= 0 && cursor.moveToFirst()) {
                    return cursor.getString(index)
                }
            }
        }
        return uri.lastPathSegment
    }

    private fun isBackupCandidate(mimeType: String?, uri: Uri, originalName: String?): Boolean {
        val name = originalName?.lowercase().orEmpty()
        if (name.endsWith(".naisbackup") || name.endsWith(".zip")) return true
        return when ((mimeType ?: contentResolver.getType(uri)).orEmpty().lowercase()) {
            "application/x-naisbackup",
            "application/zip",
            "application/x-zip-compressed",
            "application/octet-stream" -> true
            else -> false
        }
    }

    private fun copyIncomingBackup(uri: Uri, originalName: String?): String? {
        val directory = File(cacheDir, "incoming-backups")
        if (!directory.exists() && !directory.mkdirs()) return null
        val rawName = originalName
            ?.substringAfterLast('/')
            ?.replace(Regex("[^A-Za-z0-9._ -]"), "_")
            ?.trim('.', ' ')
            ?.takeIf { it.isNotEmpty() }
            ?: "shared-backup.naisbackup"
        val extension = if (rawName.lowercase().endsWith(".zip")) ".zip" else ".naisbackup"
        val stem = rawName.substringBeforeLast('.').ifBlank { "shared-backup" }.take(80)
        val target = File(
            directory,
            "$stem-${System.currentTimeMillis()}-${UUID.randomUUID().toString().take(8)}$extension",
        )
        try {
            val input = when (uri.scheme) {
                "file" -> uri.path?.let { File(it).inputStream() }
                else -> contentResolver.openInputStream(uri)
            } ?: return null
            input.use { source ->
                target.outputStream().use { destination ->
                    source.copyTo(destination)
                }
            }
            return target.absolutePath
        } catch (error: Exception) {
            target.delete()
            throw error
        }
    }

    private fun clearConsumedIncomingIntent(source: Intent) {
        source.action = null
        source.data = null
        source.clipData = null
        source.removeExtra(Intent.EXTRA_STREAM)
    }
}
