package com.codex.novelai.novelai_mobile

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.core.content.FileProvider
import android.graphics.RectF
import android.os.Build
import android.provider.OpenableColumns
import android.view.DragEvent
import io.flutter.embedding.android.FlutterActivity
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.util.UUID

class ComposerFiles(private val activity: FlutterActivity, messenger: BinaryMessenger) {
    private val channel=MethodChannel(messenger,"langbai.novelai/composer_files")
    private var region: RectF?=null
    private val allowed=setOf("png","jpg","jpeg","webp","gif","bmp","avif","pdf","txt","md","json","jsonl","csv","tsv","yaml","yml")
    init {
        channel.setMethodCallHandler { call,result ->
            when(call.method) {
                "region" -> {val m=call.arguments as? Map<*,*>;region=if(m==null)null else RectF((m["x"] as Number).toFloat(),(m["y"] as Number).toFloat(),((m["x"] as Number).toFloat()+(m["width"] as Number).toFloat()),((m["y"] as Number).toFloat()+(m["height"] as Number).toFloat()));result.success(null)}
                "paste" -> {val clipboard=activity.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager;copy(clipboard.primaryClip){paths->result.success(paths)}}
                "copyImage" -> {
                    try {
                        val bytes = call.argument<ByteArray>("bytes")
                            ?: throw IllegalArgumentException("Missing image bytes")
                        val mime = call.argument<String>("mime") ?: "image/png"
                        val ext = mapOf("image/png" to "png", "image/jpeg" to "jpg",
                            "image/webp" to "webp", "image/gif" to "gif",
                            "image/bmp" to "bmp", "image/avif" to "avif")[mime]
                            ?: throw IllegalArgumentException("Unsupported image type")
                        require(bytes.isNotEmpty() && bytes.size <= 48 * 1024 * 1024) { "Image too large" }
                        val directory = File(activity.cacheDir, "image-clipboard").apply { mkdirs() }
                        // No bitmap conversion: the published content URI serves exactly these bytes.
                        val file = File(directory, "${UUID.randomUUID()}.$ext")
                        file.writeBytes(bytes)
                        val uri = FileProvider.getUriForFile(activity,
                            "${activity.packageName}.image_clipboard", file)
                        val clipboard = activity.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                        clipboard.setPrimaryClip(ClipData.newUri(activity.contentResolver, "Image", uri))
                        result.success(true)
                    } catch (error: Exception) {
                        result.error("image_clipboard", error.message, null)
                    }
                }
                else -> result.notImplemented()
            }
        }
        activity.window.decorView.post { activity.findViewById<android.view.View>(android.R.id.content).setOnDragListener { _,event ->
            when(event.action) {
                DragEvent.ACTION_DRAG_STARTED -> region!=null
                DragEvent.ACTION_DROP -> {
                    val density=activity.resources.displayMetrics.density
                    if(region?.contains(event.x/density,event.y/density)!=true)false else {
                        val permission=if(Build.VERSION.SDK_INT>=24)activity.requestDragAndDropPermissions(event) else null
                        copy(event.clipData){paths->permission?.release();if(paths.isNotEmpty())channel.invokeMethod("drop",paths)}
                        true
                    }
                }
                else -> region!=null
            }
        }}
    }
    private fun copy(clip: ClipData?,done:(List<String>)->Unit) {
        Thread {
            val paths=mutableListOf<String>();var total=0L
            val directory=File(activity.cacheDir,"composer-inputs").apply {mkdirs()}
            if(clip!=null)for(i in 0 until minOf(clip.itemCount,64)) {
                val uri=clip.getItemAt(i).uri?:continue
                if(uri.scheme!="content" && uri.scheme!="file")continue
                var target:File?=null
                try {
                    var name="clipboard.png"
                    activity.contentResolver.query(uri,arrayOf(OpenableColumns.DISPLAY_NAME),null,null,null)?.use {cursor->if(cursor.moveToFirst())name=cursor.getString(0)?:name}
                    val extension=name.substringAfterLast('.',"").lowercase();if(extension !in allowed)continue
                    val destination=File(directory,"${UUID.randomUUID()}.$extension");target=destination
                    var size=0L
                    activity.contentResolver.openInputStream(uri)?.use {input->destination.outputStream().use {output->val buffer=ByteArray(65536);while(true){val n=input.read(buffer);if(n<0)break;size+=n;if(size>48L*1024*1024 || total+size>192L*1024*1024)throw IllegalArgumentException("Attachment too large");output.write(buffer,0,n)}}}
                    if(size>0){total+=size;paths.add(destination.absolutePath)}else destination.delete()
                }catch(_:Exception){target?.delete()}
            }
            activity.runOnUiThread {done(paths)}
        }.start()
    }
}
