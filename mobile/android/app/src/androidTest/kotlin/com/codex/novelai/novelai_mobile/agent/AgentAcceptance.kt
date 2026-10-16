package com.codex.novelai.novelai_mobile.agent

import android.app.Activity
import android.app.Instrumentation
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Process
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.ServerSocket
import java.net.Socket
import java.security.MessageDigest
import java.util.Collections
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/** Separate Android-test APK only. Assertions operate on the production runtime,
 * its real PRoot/Node processes and private files. This is not Flutter proof. */
internal class AgentAcceptance(private val instrumentation: AgentInstrumentation, private val args: Bundle) {
    private val context get() = instrumentation.targetContext
    private fun emit(kind: String, value: JSONObject) = instrumentation.sendStatus(0, Bundle().apply {
        putString("stream", "ANDROID_AGENT_$kind ${value}\n")
    })
    private fun sha(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { stream -> val buffer=ByteArray(65536); while(true){val n=stream.read(buffer);if(n<0)break;digest.update(buffer,0,n)} }
        return digest.digest().joinToString("") { "%02x".format(it.toInt() and 255) }
    }
    private fun waitSettled(agent: LocalAgentRuntime, timeout: Long, allowError: Boolean=false) {
        val end=System.currentTimeMillis()+timeout
        while(agent.snapshot()["busy"]==true && System.currentTimeMillis()<end)Thread.sleep(100)
        check(agent.snapshot()["busy"]==false){"Production runtime operation timed out"}
        if(!allowError)check(agent.snapshot()["phase"]!="error"){agent.snapshot()["logs"].toString()}
    }
    private fun procIdentity(pid: Int): JSONObject {
        check(pid>1 && pid!=Process.myPid())
        val status=File("/proc/$pid/status").readText()
        val uid=Regex("(?m)^Uid:\\s+(\\d+)").find(status)?.groupValues?.get(1)?.toInt() ?: error("Child UID unreadable")
        check(uid==Process.myUid()){"Child is not owned by QA application UID"}
        val stat=File("/proc/$pid/stat").readText();val fields=stat.substringAfterLast(") ").split(' ')
        val cmdline=File("/proc/$pid/cmdline").readText().replace('\u0000',' ')
        check(cmdline.contains("studio-sdk-driver.mjs")){"Unexpected native child command"}
        return JSONObject().put("pid",pid).put("uid",uid).put("startTimeTicks",fields[19]).put("cmdline",cmdline)
    }
    fun run() {
        // All untrusted launch bindings are checked before file writes/runtime creation.
        val target="com.codex.novelai.novelai_mobile.agenttest"
        val testPackage="$target.test"
        val nonce=args.getString("nonce")?:""
        val source=args.getString("sourceSha")?:""
        val profile=args.getString("profileSha256")?:""
        val apk=args.getString("apkSha256")?:""
        val testApk=args.getString("testApkSha256")?:""
        val trusted=context.packageName==target && instrumentation.context.packageName==testPackage &&
            args.getString("isolated")=="true" && Regex("[a-f0-9]{64}").matches(nonce) &&
            Regex("[a-f0-9]{40}").matches(source) && listOf(profile,apk,testApk).all { Regex("[a-f0-9]{64}").matches(it) } &&
            Build.VERSION.SDK_INT>=26 && Build.SUPPORTED_ABIS.first()=="arm64-v8a"
        if(!trusted){instrumentation.finish(Activity.RESULT_CANCELED,Bundle().apply{putString("stream","ANDROID AGENT BINDING REJECTED\n")});return}
        val report=JSONObject().put("schema","android-agent-device/v1").put("sourceSha",source).put("profileSha256",profile)
            .put("nonce",nonce).put("packageName",target).put("testPackage",testPackage).put("apkSha256",apk).put("testApkSha256",testApk)
            .put("nativePid",Process.myPid()).put("uid",Process.myUid()).put("sdk",Build.VERSION.SDK_INT).put("abi",Build.SUPPORTED_ABIS.first())
            .put("artVersion",System.getProperty("java.vm.version")).put("isolated",true).put("mockedModules",false)
        val checks=JSONArray();var agent:LocalAgentRuntime?=null;var activity:AgentQaActivity?=null
        val output=File(context.filesDir,"qa-agent-acceptance-$nonce.json")
        fun pass(scenario:String,observed:JSONObject){
            val check=JSONObject().put("feature","agent-components").put("scenario",scenario).put("observed",observed)
            checks.put(check);emit("CHECK",check)
        }
        try {
            check(sha(File(context.applicationInfo.sourceDir))==apk){"Installed app APK hash differs"}
            check(sha(File(instrumentation.context.applicationInfo.sourceDir))==testApk){"Installed test APK hash differs"}
            check(!File(context.filesDir,"unified-storage.json").exists()){"QA must not access shared user storage"}
            val root=File(context.filesDir,"TavernAgent");check(!root.exists()){"A cleared disposable QA installation is required"}
            check(!output.exists()){"Nonce has already been used"}
            emit("BEGIN",report)
            activity=instrumentation.openTestActivity()
            agent=LocalAgentRuntime.get(context)
            val bridge=mapOf("bridgeUrl" to "http://127.0.0.1:65534","bridgeToken" to nonce)
            agent.command("start",bridge);waitSettled(agent,30000,true)
            check(agent.snapshot()["phase"]=="error" && agent.snapshot()["running"]==false)
            check(agent.snapshot()["error"].toString().contains("not installed",true)){"Missing install must produce its actual production error"}
            check(!File(root,"active.json").exists())
            val missing=JSONObject().put("explicitMissingInstallError",true).put("noProcessStarted",true)
            context.startForegroundService(Intent(context,LocalAgentService::class.java))
            val download=agent.planDownload("component",false)
            agent.command("prepare",mapOf("kind" to "component","downloadToken" to download["token"]))
            waitSettled(agent,900000)
            check(agent.snapshot()["phase"]=="awaiting_confirmation" && agent.snapshot()["installed"]==null)
            check(!File(root,"active.json").exists()){"Preparation activated before confirmation"}
            @Suppress("UNCHECKED_CAST") val proposal=agent.snapshot()["proposal"] as Map<String,Any?>
            agent.command("confirm",mapOf("token" to proposal["token"]));waitSettled(agent,120000)
            check(agent.snapshot()["installed"]==download["version"])
            val active=JSONObject(File(root,"active.json").readText())
            val slot=File(root,"versions/${active.getString("slot")}")
            check(active.getString("sha256")==download["sha256"])
            val home=File(root,"user-home")
            val custom=File(home,"user-added-plugin/fixture.txt").apply{parentFile!!.mkdirs();writeText("QA_PLUGIN_$nonce")}
            val session=File(home,"session-fixture.jsonl").apply{writeText("QA_SESSION_$nonce")}
            val beforePlugin=sha(custom);val beforeSession=sha(session)
            agent.command("start",bridge);waitSettled(agent,180000)
            check(agent.snapshot()["running"]==true)
            val response=java.net.URL(agent.openUrl()).openConnection() as java.net.HttpURLConnection
            val status=try{response.connectTimeout=5000;response.readTimeout=5000;response.responseCode}finally{response.disconnect()}
            check(status==200 || status==401)
            pass("install-verify-activate",JSONObject().put("preparedBeforeConfirmation",true).put("activatedAfterConfirmation",true)
                .put("productionDownloadSha256",download["sha256"]).put("productionDownloadBytes",download["bytes"])
                .put("slotManifestSha256",sha(File(slot,".studio-rootfs.json"))).put("nativeNodeSha256",sha(File(slot,"usr/local/bin/node")))
                .put("actualProductionProcessRunning",true).put("loopbackHttpStatus",status))
            agent.stop();check(agent.snapshot()["running"]==false)
            agent.command("backup");waitSettled(agent,120000);val backup=agent.backups().first()
            custom.appendText("CHANGED");session.appendText("CHANGED")
            agent.command("restore",mapOf("name" to backup));waitSettled(agent,120000)
            check(sha(custom)==beforePlugin && sha(session)==beforeSession)
            check(root.listFiles()?.any{it.isDirectory && it.name.startsWith("preserved-") && File(it,"session-fixture.jsonl").isFile && File(it,"session-fixture.jsonl").readText().endsWith("CHANGED")}==true)
            check(agent.snapshot()["running"]==false)
            agent.command("start",bridge);waitSettled(agent,180000);check(agent.snapshot()["running"]==true)
            agent.stop();check(agent.snapshot()["running"]==false)
            pass("stop-restore-recovery",JSONObject().put("actualProductionChildStopped",true).put("userPluginRestoredByteExact",true)
                .put("sessionRestoredByteExact",true).put("currentDataPreserved",true).put("restartedThenExplicitlyStopped",true)
                .put("pluginSha256",beforePlugin).put("sessionSha256",beforeSession))
            // A real backup operation resets the production cancellation token;
            // do not change private cancellation state just for a test.
            agent.command("backup");waitSettled(agent,120000)
            missing.put("sdk",actualSdkRead(agent,slot,root,nonce))
            pass("missing-config-actual-process",missing)
            check(checks.length()==3)
            report.put("checks",checks).put("status","passed").put("paidCalls",0)
            output.writeText(report.toString())
            emit("DONE",report)
            instrumentation.finish(Activity.RESULT_OK,Bundle().apply{putString("stream","ANDROID AGENT ACCEPTANCE PASS 3\n")})
        }catch(error:Throwable){
            report.put("checks",checks).put("status","failed").put("error",error.toString().take(6000))
            output.writeText(report.toString());emit("FAILED",report)
            instrumentation.finish(Activity.RESULT_CANCELED,Bundle().apply{putString("stream","ANDROID AGENT ACCEPTANCE FAILED\n")})
        }finally{agent?.stop();context.stopService(Intent(context,LocalAgentService::class.java));activity?.let{value->instrumentation.runOnMainSync{value.finish()}}}
    }

    private fun actualSdkRead(agent:LocalAgentRuntime,slot:File,root:File,nonce:String):JSONObject {
        val home=File(root,"qa-sdk-home-$nonce").apply{mkdirs()}
        val workspace=File(root,home.name+"-workspace").apply{mkdirs()}
        val sentinel="NATIVE_SDK_FILE_${java.util.UUID.randomUUID()}"
        val file=File(workspace,"sentinel.txt").apply{writeText(sentinel)}
        val ack=File(context.filesDir,"qa-sdk-ack-$nonce")
        val driver=File(workspace,"studio-sdk-driver.mjs").apply{writeText("""
            console.log('SDK_NATIVE_IDENTITY '+JSON.stringify({pid:process.pid,arch:process.arch,platform:process.platform,nodeVersion:process.version}));
            process.argv=['/usr/local/bin/node','${LocalAgentRuntime.CLI}','--profile','sdk'];
            await import('${LocalAgentRuntime.CLI}');
        """.trimIndent())}
        val failure=AtomicReference<Throwable?>();val requests=Collections.synchronizedList(mutableListOf<JSONObject>())
        val server=ServerSocket(0,2,java.net.InetAddress.getByName("127.0.0.1"))
        val serverThread=Thread {
            try{repeat(2){turn->server.accept().use { socket ->
                socket.soTimeout=60000;val body=readHttp(socket);requests.add(body)
                check(body.optJSONArray("tools")?.let{tools->(0 until tools.length()).any{tools.getJSONObject(it).optString("name")=="read"}}==true || turn==1)
                if(turn==0){check(!body.toString().contains(sentinel));val end=System.currentTimeMillis()+60000
                    while(!ack.isFile && System.currentTimeMillis()<end)Thread.sleep(50)
                    check(ack.isFile && ack.readText().trim()==nonce){"Controller did not attest the live SDK PID"}
                }else check(body.toString().contains(sentinel)){"Real SDK read tool did not return sentinel bytes"}
                val events=mutableListOf<JSONObject>()
                events.add(JSONObject().put("type","message_start").put("message",JSONObject().put("id","fixture-$turn").put("type","message").put("role","assistant").put("model",body.getString("model")).put("content",JSONArray()).put("stop_reason",JSONObject.NULL).put("stop_sequence",JSONObject.NULL).put("usage",JSONObject().put("input_tokens",10).put("output_tokens",0))))
                if(turn==0){
                    events.add(JSONObject().put("type","content_block_start").put("index",0).put("content_block",JSONObject().put("type","tool_use").put("id","native-read").put("name","read").put("input",JSONObject())))
                    events.add(JSONObject().put("type","content_block_delta").put("index",0).put("delta",JSONObject().put("type","input_json_delta").put("partial_json",JSONObject().put("file_path","/workspace/sentinel.txt").toString())))
                }else{
                    events.add(JSONObject().put("type","content_block_start").put("index",0).put("content_block",JSONObject().put("type","text").put("text","")))
                    events.add(JSONObject().put("type","content_block_delta").put("index",0).put("delta",JSONObject().put("type","text_delta").put("text","NATIVE_SDK_READ_DONE")))
                }
                events.add(JSONObject().put("type","content_block_stop").put("index",0))
                events.add(JSONObject().put("type","message_delta").put("delta",JSONObject().put("stop_reason",if(turn==0)"tool_use" else "end_turn").put("stop_sequence",JSONObject.NULL)).put("usage",JSONObject().put("output_tokens",20)))
                events.add(JSONObject().put("type","message_stop"))
                val content=events.joinToString(""){"event: ${it.getString("type")}\ndata: $it\n\n"}.toByteArray()
                socket.getOutputStream().apply{write("HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: ${content.size}\r\nConnection: close\r\n\r\n".toByteArray());write(content);flush()}
            }}}catch(error:Throwable){failure.set(error)}
        }.apply{isDaemon=true;start()}
        val spawn=LocalAgentRuntime::class.java.getDeclaredMethod("spawn",File::class.java,File::class.java,List::class.java,Map::class.java).apply{isAccessible=true}
        val process=spawn.invoke(agent,slot,home,listOf("/usr/local/bin/node","/workspace/studio-sdk-driver.mjs"),mapOf("DEEPSEEK_API_KEY" to "SYNTHETIC_LOCAL_MODEL_NOT_A_KEY","DEEPSEEK_BASE_URL" to "http://127.0.0.1:${server.localPort}")) as java.lang.Process
        val frames=Collections.synchronizedList(mutableListOf<JSONObject>());val identity=AtomicReference<JSONObject?>()
        val stdout=Collections.synchronizedList(mutableListOf<String>())
        val reader=Thread{process.inputStream.bufferedReader().useLines{lines->lines.forEach{line->
            stdout.add(line.take(32768));if(line.startsWith("SDK_NATIVE_IDENTITY "))identity.set(JSONObject(line.substringAfter("SDK_NATIVE_IDENTITY ")))
            else runCatching{JSONObject(line)}.getOrNull()?.let{frames.add(it)}
        }}}.apply{isDaemon=true;start()}
        fun waitFor(predicate:()->Boolean){val end=System.currentTimeMillis()+90000;while(!predicate() && System.currentTimeMillis()<end){failure.get()?.let{throw it};check(process.isAlive){"Actual SDK exited early: ${stdout.takeLast(8)}"};Thread.sleep(50)};check(predicate()){"Actual SDK operation timed out"}}
        val writer=process.outputStream.bufferedWriter()
        fun send(id:Int,method:String,params:JSONObject){writer.write(JSONObject().put("jsonrpc","2.0").put("id",id).put("method",method).put("params",params).toString()+"\n");writer.flush()}
        try{
            waitFor{identity.get()!=null};val node=identity.get()!!
            check(node.getString("arch")=="arm64" && node.getString("platform")=="linux")
            val proc=procIdentity(node.getInt("pid"));emit("SDK_BEGIN",proc.put("nonce",nonce))
            send(1,"initialize",JSONObject().put("cwd","/workspace").put("provider","deepseek-official").put("model","deepseek-v4-pro").put("reasoningEffort","off").put("maxTokens",512))
            waitFor{frames.any{it.optInt("id")==1}};check(frames.first{it.optInt("id")==1}.getJSONObject("result").getJSONObject("serverInfo").getString("name")=="deepseek-harness-sdk-runtime")
            send(2,"session/prompt",JSONObject().put("sessionId","native-sdk-sentinel").put("contentBlocks",JSONArray().put(JSONObject().put("type","text").put("text","Read sentinel.txt with the read tool, then finish."))))
            waitFor{requests.size==2 && frames.any{it.optString("method")=="session.status" && it.optJSONObject("params")?.optString("status")=="idle"}}
            send(3,"shutdown",JSONObject());check(process.waitFor(30,TimeUnit.SECONDS)){"SDK did not exit after shutdown"}
            reader.join(5000);serverThread.join(5000);failure.get()?.let{throw it}
            check(process.exitValue()==0 && requests.size==2 && file.readText()==sentinel)
            return JSONObject().put("identity",node).put("proc",proc).put("exitStatus",0).put("actualReadTool",true)
                .put("loopbackModelRequests",2).put("actualReadFileSha256",sha(file)).put("driverSha256",sha(driver))
                .put("cliSha256",sha(File(slot,LocalAgentRuntime.CLI.removePrefix("/")))).put("nativeNodeSha256",sha(File(slot,"usr/local/bin/node")))
                .put("controllerAttestedLivePid",true).put("modelTransport","actual-localhost-http-sse").put("paidCalls",0)
        }finally{server.close();if(process.isAlive)process.destroy();reader.join(2000);serverThread.join(2000)}
    }
    private fun readHttp(socket:Socket):JSONObject {
        val input=socket.getInputStream().buffered()
        fun line():String {val bytes=java.io.ByteArrayOutputStream();while(true){val b=input.read();check(b>=0){"Unexpected HTTP EOF"};if(b==10)break;bytes.write(b);check(bytes.size()<16384)};return bytes.toString("UTF-8").trimEnd('\r')}
        check(line().startsWith("POST ")){"Only actual model POSTs are accepted"}
        val headers=mutableMapOf<String,String>();var total=0
        while(true){val text=line();if(text.isEmpty())break;total+=text.length;check(total<32768);headers[text.substringBefore(':').lowercase()]=text.substringAfter(':').trim()}
        val out=java.io.ByteArrayOutputStream()
        fun take(n:Int){check(n>=0 && out.size()+n<=8*1024*1024);repeat(n){val b=input.read();check(b>=0);out.write(b)}}
        if(headers["transfer-encoding"]?.lowercase()=="chunked")while(true){val n=line().substringBefore(';').toInt(16);if(n==0){while(line().isNotEmpty()){};break};take(n);check(line().isEmpty())}
        else take(headers["content-length"]?.toInt()?:error("Missing HTTP content length"))
        return JSONObject(out.toString("UTF-8"))
    }
}
