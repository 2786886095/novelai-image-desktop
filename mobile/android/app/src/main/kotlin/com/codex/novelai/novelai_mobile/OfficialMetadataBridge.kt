package com.codex.novelai.novelai_mobile

import android.app.Activity
import android.os.Handler
import android.os.Looper
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodChannel
import org.json.JSONObject
import org.json.JSONTokener
import java.io.ByteArrayInputStream

/** Memory-only owned document + dedicated Worker. No JavaScript/native bridge.
 * Network and file/content access are denied, including Worker-origin requests.
 * Image/remote asset bytes only cross the local Flutter message channel. */
class OfficialMetadataBridge(private val activity: Activity, messenger: BinaryMessenger) {
    private val channel = MethodChannel(messenger, "langbai.novelai/official_metadata")
    private val handler = Handler(Looper.getMainLooper())
    private var active: Session? = null
    private class Session(val id: String, val view: WebView, val result: MethodChannel.Result) {
        var settled = false
        var timeout: Runnable? = null
    }
    init {
        channel.setMethodCallHandler { call, result ->
            when (call.method) {
                "cancel" -> {
                    val id = call.argument<String>("id")
                    active?.takeIf { it.id == id }?.let { finish(it, null, "cancelled") }
                    result.success(null)
                }
                "read" -> {
                    val id = call.argument<String>("id")
                    val host = call.argument<String>("host")
                    val worker = call.argument<String>("worker")
                    val payload = call.argument<String>("payload")
                    if(id==null||id.length>160||host==null||host.length>1024*1024||
                        worker==null||worker.length>1024*1024||payload==null||payload.length>92*1024*1024) {
                        result.error("invalid_input","Metadata sandbox input exceeds safety limits",null)
                    } else start(id,host,worker,payload,result)
                }
                else -> result.notImplemented()
            }
        }
    }
    private fun finish(session: Session, value: String?, error: String?) {
        if (session.settled) return
        session.settled = true
        session.timeout?.let { handler.removeCallbacks(it) }
        if (active === session) active = null
        session.view.stopLoading()
        session.view.destroy()
        if(error!=null)session.result.error(error,"Isolated metadata reader failed; no offline fallback",null)
        else session.result.success(value)
    }
    private fun start(id:String,host:String,worker:String,payload:String,result:MethodChannel.Result) {
        active?.let { finish(it,null,"cancelled") }
        val view=WebView(activity)
        val session=Session(id,view,result);active=session
        view.settings.apply {
            javaScriptEnabled=true
            domStorageEnabled=false
            allowFileAccess=false
            allowContentAccess=false
            blockNetworkLoads=true
            javaScriptCanOpenWindowsAutomatically=false
            setSupportMultipleWindows(false)
        }
        view.webViewClient=object:WebViewClient() {
            override fun shouldOverrideUrlLoading(v:WebView,request:WebResourceRequest)=true
            override fun shouldInterceptRequest(v:WebView,request:WebResourceRequest):WebResourceResponse? {
                if(request.url.scheme=="blob")return null // memory-only owned Worker, not a network URL
                return WebResourceResponse("text/plain","utf-8",ByteArrayInputStream(ByteArray(0)))
            }
            override fun onPageFinished(v:WebView,url:String) {
                if(active!==session||session.settled)return
                push(session,payload,worker,0)
            }
        }
        session.timeout=Runnable { finish(session,null,"sandbox_timeout") }
        handler.postDelayed(session.timeout!!,40000)
        val csp="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; worker-src blob:; child-src blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
        val html="<!doctype html><meta charset=\"utf-8\"><meta http-equiv=\"Content-Security-Policy\" content=\"$csp\"><script>${host.replace("</script","<\\/script")}</script>"
        view.loadDataWithBaseURL("https://metadata.invalid/",html,"text/html","utf-8",null)
    }
    private fun push(session:Session,payload:String,worker:String,offset:Int) {
        if(active!==session||session.settled)return
        if(offset<payload.length) {
            val end=minOf(offset+60000,payload.length)
            session.view.evaluateJavascript("naiMetadataChunk(${JSONObject.quote(payload.substring(offset,end))})") {
                push(session,payload,worker,end)
            }
        } else {
            session.view.evaluateJavascript("naiMetadataStart(${JSONObject.quote(worker)})") { poll(session) }
        }
    }
    private fun poll(session:Session) {
        if(active!==session||session.settled)return
        session.view.evaluateJavascript("JSON.stringify(globalThis.naiMetadataResult)") { encoded ->
            if(active!==session||session.settled)return@evaluateJavascript
            try {
                val value=JSONTokener(encoded).nextValue()
                if(value is String && value!="null") {
                    if(value.length>24*1024*1024)finish(session,null,"response_limit")
                    else { JSONObject(value);finish(session,value,null) }
                } else handler.postDelayed({poll(session)},50)
            } catch(_:Exception) { finish(session,null,"invalid_response") }
        }
    }
    fun dispose() { active?.let { finish(it,null,"cancelled") };channel.setMethodCallHandler(null) }
}
