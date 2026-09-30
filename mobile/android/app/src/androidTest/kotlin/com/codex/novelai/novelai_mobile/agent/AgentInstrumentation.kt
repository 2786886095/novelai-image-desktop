package com.codex.novelai.novelai_mobile.agent
import android.app.Instrumentation
import android.app.Activity
import android.content.Intent
import android.os.Bundle
import org.json.JSONObject
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Runs only in the separate .agenttest installation. Never touches production data. */
class AgentInstrumentation: Instrumentation() {
    private var arguments=Bundle()
    override fun onCreate(args: Bundle?) {super.onCreate(args);arguments=args?:Bundle();start()}
    override fun onStart(){
        val evidence=JSONObject().put("deviceSdk",android.os.Build.VERSION.SDK_INT).put("abi",android.os.Build.SUPPORTED_ABIS[0])
        val checks=org.json.JSONArray()
        fun pass(name:String){checks.put(name);sendStatus(0,Bundle().apply{putString("stream","PASS $name\n")})}
        var agent:LocalAgentRuntime?=null
        try {
            check(targetContext.packageName.endsWith(".agenttest")){"QA package isolation required"}
            agent=LocalAgentRuntime.get(targetContext)
            val home=File(targetContext.filesDir,"TavernAgent/user-home")
            if(arguments.getString("handoffOnly")=="true"){
                val first=agent.stop();val second=agent.stop()
                check(second>first && agent.snapshot()["stopRevision"]==second)
                pass("native-stop-revision-increments")
                for(command in listOf("prepare","confirm","uninstall")){
                    val error=runCatching{agent.command(command,mapOf("expectedStopRevision" to first,"confirmed" to true))}.exceptionOrNull()
                    check(error?.message?.contains("stopped after handoff")==true){"Stale handoff was not rejected before $command"}
                }
                pass("stale-handoff-rejected-before-all-component-mutations")
                check(agent.snapshot()["running"]==false && agent.snapshot()["busy"]==false)
                pass("native-guard-does-not-download-or-start-runtime")
                evidence.put("checks",checks).put("status","passed")
                File(targetContext.filesDir,"qa-device-evidence.json").writeText(evidence.toString(2))
                finish(Activity.RESULT_OK,Bundle().apply{putString("stream","ANDROID HANDOFF QA PASS\n")})
                return
            }
            if(arguments.getString("overlayOnly")=="true"){
                val fixture=File(targetContext.filesDir,"overlay-qa-${java.util.UUID.randomUUID()}")
                val slot=File(fixture,"slot");val data=File(fixture,"data")
                val installed=File(data,"profiles/node_modules/@langbai/dsh-studio-tools")
                val seeded=File(slot,"opt/agent/plugins/studio-tools")
                for(name in listOf("package.json","index.js")){
                    val bytes=targetContext.assets.open("agent-presentation/tools/$name").use{it.readBytes()}
                    File(installed,name).apply{parentFile!!.mkdirs();writeBytes(bytes)}
                    File(seeded,name).apply{parentFile!!.mkdirs();writeBytes(bytes)}
                }
                val method=LocalAgentRuntime::class.java.getDeclaredMethod("presentation",File::class.java,File::class.java)
                method.isAccessible=true
                val managed=method.invoke(agent,slot,data) as File
                check(File(managed,"presentation.patch.yml").readText().contains("studio-tools-managed"))
                check(File(managed,"tools/index.js").readText().contains("createDecisionJournal"))
                check(File(managed,"tools/index.js").readBytes().contentEquals(File(seeded,"index.js").readBytes()))
                pass("apk-current-tools-overlay-and-durable-jev-receipts")
                File(installed,"index.js").appendText("\n// user-owned change\n")
                val preserved=method.invoke(agent,slot,data) as File
                check(!File(preserved,"presentation.patch.yml").readText().contains("studio-tools-managed"))
                check(File(installed,"index.js").readText().endsWith("// user-owned change\n"))
                pass("custom-tools-preserved-without-shadowing")
                check(agent.snapshot()["running"]==false)
                pass("overlay-test-does-not-download-or-start-runtime")
                evidence.put("checks",checks).put("status","passed")
                File(targetContext.filesDir,"qa-device-evidence.json").writeText(evidence.toString(2))
                finish(Activity.RESULT_OK,Bundle().apply{putString("stream","ANDROID OVERLAY QA PASS\n")})
                return
            }
            if(arguments.getString("resumeOnly")=="true"){
                check(File(home,"user-added-plugin/fixture.txt").readText()=="user-owned-plugin")
                check(File(home,"session-fixture.jsonl").readText()=="original-session")
                check(agent.snapshot()["running"]==false)
                pass("apk-reinstall-preserves-user-data-and-does-not-autostart")
            }else{
                sendStatus(0,Bundle().apply{putString("stream","QA: opening isolated test activity (30 second limit)\n")})
                val activity=openTestActivity()
                sendStatus(0,Bundle().apply{putString("stream","QA: activity ready; preparing runtime\n")})
                targetContext.startForegroundService(Intent(targetContext,LocalAgentService::class.java))
                val download=agent.planDownload("component",false)
                agent.command("prepare",mapOf("kind" to "component","downloadToken" to download["token"]));waitIdle(agent,600000)
                check(agent.snapshot()["phase"]=="awaiting_confirmation"){agent.snapshot()["logs"].toString()}
                check(agent.snapshot()["installed"]==null){"Fresh QA install required"}
                pass("prepare-does-not-activate-before-confirmation")
                @Suppress("UNCHECKED_CAST") val proposal=agent.snapshot()["proposal"] as Map<String,Any?>
                agent.command("confirm",mapOf("token" to proposal["token"]));waitIdle(agent,60000)
                check(agent.snapshot()["installed"]==download["version"])
                pass("confirmed-activation")
                File(home,"user-added-plugin").mkdirs();File(home,"user-added-plugin/fixture.txt").writeText("user-owned-plugin")
                File(home,"session-fixture.jsonl").writeText("original-session")
                agent.command("backup");waitIdle(agent,60000);val backup=agent.backups().first()
                File(home,"session-fixture.jsonl").writeText("changed-session")
                agent.command("restore",mapOf("name" to backup));waitIdle(agent,60000)
                check(File(home,"session-fixture.jsonl").readText()=="original-session")
                check(File(home,"user-added-plugin/fixture.txt").readText()=="user-owned-plugin")
                pass("backup-restores-session-and-custom-file")
                targetContext.startForegroundService(Intent(targetContext,LocalAgentService::class.java))
                agent.command("start",mapOf("bridgeUrl" to "http://127.0.0.1:65534","bridgeToken" to "a".repeat(64)))
                waitIdle(agent,180000);check(agent.snapshot()["running"]==true){agent.snapshot()["logs"].toString()}
                pass("android-native-proot-harness-startup")
                val url=agent.openUrl();runOnMainSync{activity.browser.loadUrl(url)}
                var body=""
                val deadline=System.currentTimeMillis()+120000
                while(System.currentTimeMillis()<deadline){
                    val latch=CountDownLatch(1)
                    runOnMainSync{activity.browser.evaluateJavascript("document.body ? document.body.innerText : ''"){body=it;latch.countDown()}}
                    latch.await(5,TimeUnit.SECONDS)
                    check(!body.contains("Failed to load plugins",true) && !body.contains("entries did not activate",true)){body.take(2000)}
                    if(body.length>300 && (body.contains("Roleplay",true)||body.contains("Settings",true)||body.contains("设置")||body.contains("Studio")))break
                    Thread.sleep(1000)
                }
                check(body.length>300){"Web UI did not finish booting: ${body.take(1000)}"}
                File(targetContext.filesDir,"qa-web-body.txt").writeText(body.take(20000))
                pass("android-webview-plugin-boot")
                runOnMainSync{activity.moveTaskToBack(true)};Thread.sleep(15000)
                check(agent.snapshot()["running"]==true)
                pass("foreground-service-survives-background-15-seconds")
                agent.stop();check(agent.snapshot()["running"]==false)
                pass("explicit-stop")
                runOnMainSync{activity.finish()}
            }
            evidence.put("checks",checks).put("status","passed")
            File(targetContext.filesDir,"qa-device-evidence.json").writeText(evidence.toString(2))
            finish(Activity.RESULT_OK,Bundle().apply{putString("stream","ANDROID DEVICE QA PASS\n")})
        }catch(error:Throwable){
            evidence.put("checks",checks).put("status","failed").put("error",error.toString().take(6000))
            agent?.snapshot()?.get("logs")?.let{evidence.put("logs",it)}
            File(targetContext.filesDir,"qa-device-evidence.json").writeText(evidence.toString(2))
            agent?.stop();finish(Activity.RESULT_CANCELED,Bundle().apply{putString("stream","ANDROID DEVICE QA FAILED: ${error.toString().take(3000)}\n")})
        }
    }
    private fun openTestActivity():AgentQaActivity {
        // Do not wait for an idle Flutter message queue: ongoing frame/poll work
        // can starve startActivitySync even when the app is already foreground.
        val app=targetContext.applicationContext as android.app.Application
        val ready=CountDownLatch(1)
        val found=java.util.concurrent.atomic.AtomicReference<AgentQaActivity>()
        val observer=object:android.app.Application.ActivityLifecycleCallbacks {
            override fun onActivityResumed(a:Activity){if(a is AgentQaActivity){found.set(a);ready.countDown()}}
            override fun onActivityCreated(a:Activity,b:Bundle?){}
            override fun onActivityStarted(a:Activity){}
            override fun onActivityPaused(a:Activity){}
            override fun onActivityStopped(a:Activity){}
            override fun onActivitySaveInstanceState(a:Activity,b:Bundle){}
            override fun onActivityDestroyed(a:Activity){}
        }
        try {
            runOnMainSync{app.registerActivityLifecycleCallbacks(observer);targetContext.startActivity(Intent(targetContext,AgentQaActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))}
            check(ready.await(30,TimeUnit.SECONDS)){"Test activity did not resume within 30 seconds"}
            return checkNotNull(found.get())
        }finally{runOnMainSync{app.unregisterActivityLifecycleCallbacks(observer)}}
    }
    private fun waitIdle(agent:LocalAgentRuntime,timeout:Long){
        val deadline=System.currentTimeMillis()+timeout
        while(agent.snapshot()["busy"]==true && System.currentTimeMillis()<deadline)Thread.sleep(500)
        check(agent.snapshot()["busy"]!=true){"Operation timeout"}
        check(agent.snapshot()["phase"]!="error"){agent.snapshot()["logs"].toString()}
    }
}
