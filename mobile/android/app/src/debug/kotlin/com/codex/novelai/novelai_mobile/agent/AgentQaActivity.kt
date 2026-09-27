package com.codex.novelai.novelai_mobile.agent
import android.app.Activity
import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Button
import android.content.Intent
import org.json.JSONObject
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Test-only rendering seat. Never included in release APKs. */
class AgentQaActivity: Activity() {
    lateinit var browser: WebView
    private lateinit var status:TextView
    private var launched=false
    override fun onCreate(state: Bundle?){
        super.onCreate(state)
        check(packageName.endsWith(".agenttest"))
        browser=WebView(this)
        browser.settings.javaScriptEnabled=true
        browser.settings.domStorageEnabled=true
        browser.settings.allowFileAccess=false
        browser.settings.allowContentAccess=false
        browser.webViewClient=WebViewClient()
        status=TextView(this).apply{setPadding(20,20,20,20);text="Studio 独立实机测试：不使用正式版资料。"}
        val start=Button(this).apply{text="开始本机实测";setOnClickListener{begin()}}
        val layout=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;addView(status);addView(start);addView(browser,LinearLayout.LayoutParams(-1,0,1f))}
        setContentView(layout)
    }
    override fun onResume(){super.onResume();if(intent.getBooleanExtra("runQa",false)&&!launched)window.decorView.postDelayed({begin()},500)}
    private fun begin(){
        if(launched)return;launched=true
        startForegroundService(Intent(this,LocalAgentService::class.java))
        Thread({probe()},"studio-real-device-probe").start()
    }
    private fun probe(){
        val agent=LocalAgentRuntime.get(this)
        val checks=org.json.JSONArray()
        val evidence=JSONObject().put("deviceSdk",android.os.Build.VERSION.SDK_INT).put("abi",android.os.Build.SUPPORTED_ABIS[0])
        val file=File(filesDir,"qa-direct-evidence.json")
        fun record(message:String){
            evidence.put("progress",message).put("checks",checks).put("logs",agent.snapshot()["logs"].toString())
            file.writeText(evidence.toString(2));runOnUiThread{status.text=message}
        }
        fun pass(message:String){checks.put(message);record("PASS $message")}
        fun waitIdle(timeout:Long){
            val until=System.currentTimeMillis()+timeout
            while(agent.snapshot()["busy"]==true && System.currentTimeMillis()<until){Thread.sleep(1000);record("实机运行中：${agent.snapshot()["phase"]}")}
            check(agent.snapshot()["busy"]!=true){"Runtime operation timed out"}
            check(agent.snapshot()["phase"]!="error"){agent.snapshot()["logs"].toString()}
        }
        try {
            record("正在本机解压并启动兼容检查，请保持此页。")
            if(agent.snapshot()["installed"]==null){
                agent.command("prepare");waitIdle(600000)
                check(agent.snapshot()["phase"]=="awaiting_confirmation")
                check(agent.snapshot()["installed"]==null);pass("prepare-keeps-runtime-inactive")
                @Suppress("UNCHECKED_CAST") val proposal=agent.snapshot()["proposal"] as Map<String,Any?>
                agent.command("confirm",mapOf("token" to proposal["token"]));waitIdle(60000)
                pass("confirmed-install")
            }
            val home=File(filesDir,"TavernAgent/user-home")
            File(home,"user-added-plugin").mkdirs();File(home,"user-added-plugin/fixture.txt").writeText("user-owned-plugin")
            File(home,"session-fixture.jsonl").writeText("original-session")
            agent.command("backup");waitIdle(60000);val backup=agent.backups().first()
            File(home,"session-fixture.jsonl").writeText("changed-session")
            agent.command("restore",mapOf("name" to backup));waitIdle(60000)
            check(File(home,"session-fixture.jsonl").readText()=="original-session")
            check(File(home,"user-added-plugin/fixture.txt").readText()=="user-owned-plugin")
            pass("backup-restore-preserves-custom-data")
            agent.command("start",mapOf("bridgeUrl" to "http://127.0.0.1:65534","bridgeToken" to "a".repeat(64)));waitIdle(180000)
            check(agent.snapshot()["running"]==true);pass("native-harness-startup")
            val url=agent.openUrl()
            if(intent.getBooleanExtra("externalQa",false)){
                val uri=android.net.Uri.parse(url)
                evidence.put("launchHasToken",!uri.getQueryParameter("token").isNullOrEmpty())
                fun request(address:String,cookie:String?=null):Pair<Int,String?>{
                    val c=java.net.URL(address).openConnection() as java.net.HttpURLConnection
                    c.instanceFollowRedirects=false;c.connectTimeout=5000;c.readTimeout=5000
                    if(cookie!=null)c.setRequestProperty("Cookie",cookie)
                    return try{Pair(c.responseCode,c.getHeaderField("Set-Cookie")?.substringBefore(';'))}finally{c.disconnect()}
                }
                val bare="http://127.0.0.1:${uri.port}/"
                evidence.put("bareStatus",request(bare).first)
                val exchange=request(url);evidence.put("exchangeStatus",exchange.first)
                evidence.put("cookieStatus",request(bare,exchange.second).first)
                record("EXTERNAL BROWSER HANDOFF")
                runOnUiThread{startActivity(Intent(Intent.ACTION_VIEW,android.net.Uri.parse(agent.browserUrl())))}
                return
            }
            runOnUiThread{browser.loadUrl(url)}
            var body="";var ready=false;val until=System.currentTimeMillis()+120000
            while(System.currentTimeMillis()<until){
                val latch=CountDownLatch(1)
                runOnUiThread{browser.evaluateJavascript("document.body ? document.body.innerText : ''"){body=it;latch.countDown()}}
                latch.await(5,TimeUnit.SECONDS)
                check(!body.contains("Failed to load plugins",true)&&!body.contains("entries did not activate",true)){body.take(2500)}
                if(body.length>300&&(body.contains("Roleplay",true)||body.contains("Settings",true)||body.contains("设置")||body.contains("Studio"))){ready=true;break}
                Thread.sleep(1000)
            }
            check(ready){"Web UI not ready: ${body.take(1500)}"}
            File(filesDir,"qa-direct-web-body.txt").writeText(body.take(20000));pass("real-webview-plugin-boot")
            runOnUiThread{moveTaskToBack(true)};Thread.sleep(15000)
            check(agent.snapshot()["running"]==true);pass("background-15-seconds")
            agent.stop();check(agent.snapshot()["running"]==false);pass("explicit-stop")
            evidence.put("status","passed");record("ANDROID DIRECT DEVICE PASS")
        }catch(e:Throwable){
            evidence.put("status","failed").put("error",e.toString().take(6000));record("ANDROID DIRECT DEVICE FAILED: ${e.toString().take(1200)}")
            agent.stop()
        }
    }
}
