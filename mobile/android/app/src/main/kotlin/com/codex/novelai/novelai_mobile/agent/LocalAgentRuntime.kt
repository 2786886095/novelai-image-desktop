package com.codex.novelai.novelai_mobile.agent

import android.content.Context
import android.os.Build
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.nio.file.Files
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/** One owner for all child processes and install transactions in this app process.
 * Runtime slots are disposable. user-home/workspace/backups NEVER live in a slot.
 */
class LocalAgentRuntime private constructor(private val context: Context) {
    companion object {
        @Volatile private var instance: LocalAgentRuntime? = null
        fun get(context: Context): LocalAgentRuntime = instance ?: synchronized(this) {
            instance ?: LocalAgentRuntime(context.applicationContext).also { instance = it }
        }
        const val CLI = "/opt/agent/runtime/node_modules/@deepseek-ai/dsh/lib/bin.js"
        const val CHANNEL = "https://api.github.com/repos/2786886095/novelai-image-desktop/releases?per_page=30"
    }
    private val root = File(context.filesDir, "TavernAgent")
    private val home = File(root, "user-home")
    private val worker = Executors.newSingleThreadExecutor()
    private val logs = ArrayDeque<String>()
    @Volatile private var phase = "stopped"
    @Volatile private var error: String? = null
    @Volatile private var busy = false
    @Volatile private var child: Process? = null
    @Volatile private var auxiliary: Process? = null
    @Volatile private var cancelled = false
    @Volatile private var stopping = false
    @Volatile private var portableLock: String? = null
    @Volatile private var launchUrl: String? = null
    @Volatile private var progress = 0.0
    @Volatile private var upstream = ""
    @Volatile private var update: JSONObject? = null
    @Volatile private var proposal: Proposal? = null
    private data class Proposal(val token: String, val slot: File, val seed: JSONObject, val before: String, val expires: Long)
    private val activeFile get() = File(root, "active.json")
    private fun active(): JSONObject? = if (activeFile.exists()) JSONObject(activeFile.readText()) else null
    private fun activeSlot(): File {
        val id = active()?.getString("slot") ?: error("Agent is not installed")
        require(Regex("[a-zA-Z0-9.-]+\\z").matches(id))
        return File(root, "versions/$id")
    }
    private fun seed(): JSONObject = context.assets.open("agent/seed.json").bufferedReader().use { JSONObject(it.readText()) }
    @Synchronized private fun log(text: String) {
        // Bootstrap URLs and provider credentials must never reach persistent/UI logs.
        val cleaned = text.replace(Regex("https?://[^\\s]+"), "[URL]")
            .replace(Regex("(?i)(token|authorization|api[_-]?key|password)\\s*[:=]\\s*[^\\s,]+"), "$1=[redacted]")
        logs.addLast(cleaned.take(1800)); while (logs.size > 180) logs.removeFirst()
    }
    @Synchronized fun snapshot(): Map<String, Any?> = mapOf(
        "supported" to (Build.VERSION.SDK_INT >= 26 && Build.SUPPORTED_ABIS.contains("arm64-v8a")),
        "phase" to phase, "busy" to (busy || stopping), "error" to error, "progress" to progress,
        "running" to (child?.isAlive == true && phase == "running"),
        "installed" to active()?.optString("version"), "installedUpstream" to active()?.optString("upstream"),
        "official" to upstream, "candidate" to update?.optString("version"),
        "dataDirectory" to home.absolutePath, "backupDirectory" to File(root,"backups").absolutePath,
        "logs" to logs.toList(), "proposal" to proposal?.let { mapOf("token" to it.token,"version" to it.seed.getString("version"),"upstream" to it.seed.getString("upstream")) }
    )
    @Synchronized fun command(name: String, args: Map<String, Any?> = emptyMap()) {
        check(!busy && !stopping && portableLock==null) { "Another Agent operation or backup is in progress" }
        require(Build.VERSION.SDK_INT >= 26 && Build.SUPPORTED_ABIS.contains("arm64-v8a")) { "Local Agent requires Android 8+ and ARM64" }
        if (name != "check") check(child == null) { "Stop Agent before changing runtime or data" }
        busy = true; error = null; if(name!="check")cancelled=false
        worker.execute {
            try {
                root.mkdirs()
                when(name) {
                    "check" -> checkUpdates()
                    "prepare" -> prepare()
                    "confirm" -> confirm(args["token"] as? String ?: "")
                    "start" -> start(args)
                    "backup" -> backup()
                    "restore" -> restore(args["name"] as? String ?: "")
                    else -> error("Unknown Agent operation")
                }
            } catch (failure: Exception) {
                error = failure.message?.take(300) ?: failure.javaClass.simpleName
                log("ERROR: ${error}")
                if (child == null) phase = if(cancelled)"stopped" else "error"
            } finally { busy = false }
        }
    }
    private fun validate(meta: JSONObject) {
        require(meta.getInt("format") == 1 && meta.getInt("protocol") == 1 && meta.getString("platform") == "android" && meta.getString("arch") == "arm64")
        require(meta.getInt("minSdk") <= Build.VERSION.SDK_INT)
        require(Regex("[a-f0-9]{64}").matches(meta.getString("sha256")))
        require(meta.getLong("bytes") in 1..1_500_000_000L && meta.getLong("unpackedBytes") in 1..4_000_000_000L)
        require(Regex("[0-9]+\\.[0-9]+\\.[0-9]+(?:-[a-zA-Z0-9.-]+)?").matches(meta.getString("version")))
        // Newer Harness versions need a Studio protocol/adapter update, not an npm-latest install.
        require(meta.getString("upstream") == "0.1.7-rc.2") { "Runtime needs a newer Studio compatibility adapter" }
    }
    private fun fetchText(url: String): String {
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.connectTimeout=15000;connection.readTimeout=20000
        connection.setRequestProperty("User-Agent", "Langbai-Studio-Android/2.3.7")
        try { check(connection.responseCode == 200) { "Update HTTP ${connection.responseCode}" }
            val bytes=connection.inputStream.use { it.readBytesLimited(2*1024*1024) };return String(bytes,Charsets.UTF_8)
        } finally { connection.disconnect() }
    }
    private fun java.io.InputStream.readBytesLimited(limit: Int): ByteArray {
        val out=java.io.ByteArrayOutputStream();val buffer=ByteArray(65536)
        while(true){val n=read(buffer);if(n<0)break;check(out.size()+n<=limit){"Response too large"};out.write(buffer,0,n)}
        return out.toByteArray()
    }
    private fun checkUpdates() {
        log("Checking Studio Android component and official Harness separately…")
        try { val local=seed();validate(local);update=local } catch (_: Exception) { log("No bundled Android seed in this build") }
        try {
            val releases=org.json.JSONArray(fetchText(CHANNEL))
            for(i in 0 until releases.length()) {
                val release=releases.getJSONObject(i)
                if(release.optBoolean("draft") || !release.getString("tag_name").startsWith("agent-v"))continue
                val assets=release.getJSONArray("assets")
                for(j in 0 until assets.length()) {
                    val item=assets.getJSONObject(j)
                    if(item.getString("name")!="android-agent.json")continue
                    val url=item.getString("browser_download_url")
                    require(url.startsWith("https://github.com/2786886095/novelai-image-desktop/releases/download/"))
                    val candidate=JSONObject(fetchText(url));validate(candidate)
                    candidate.put("url",url.substringBeforeLast('/')+"/agent-rootfs.zip")
                    update=candidate
                    break
                }
                if(update?.has("url")==true)break
            }
        } catch (_: Exception) { log("Studio channel check failed; installed runtime unchanged") }
        try { upstream=JSONObject(fetchText("https://registry.npmjs.org/@deepseek-ai%2fdsh/latest")).getString("version") }
        catch (_: Exception) { log("Official Harness check failed; no automatic install") }
        log("Update checks finished. Changes require a successful compatibility probe and confirmation.")
    }
    private fun prepare() {
        check(child==null);phase="preparing";proposal=null;progress=0.0
        val meta=update ?: seed();validate(meta)
        check(active()?.optString("sha256") != meta.getString("sha256")) { "This component is already installed" }
        check(root.usableSpace > meta.getLong("unpackedBytes")*2 + meta.getLong("bytes") + 512L*1024*1024) { "Insufficient free storage" }
        val slot=File(root,"versions/${meta.getString("version")}-${UUID.randomUUID()}")
        val archive=File(root,"candidate-${UUID.randomUUID()}.zip")
        try {
            val input=if(meta.has("url")) {
                val url=meta.getString("url")
                require(url.startsWith("https://github.com/2786886095/novelai-image-desktop/releases/download/"))
                (URL(url).openConnection() as HttpURLConnection).apply {connectTimeout=20000;readTimeout=30000}.inputStream
            } else context.assets.open("agent/"+meta.getString("asset"))
            var received=0L
            input.use { incoming -> archive.outputStream().use { out ->
                val buffer=ByteArray(131072)
                while(true){check(!cancelled){"Cancelled"};val n=incoming.read(buffer);if(n<0)break;received+=n;check(received<=meta.getLong("bytes"));out.write(buffer,0,n);progress=received.toDouble()/meta.getLong("bytes")*.5}
            } }
            check(received==meta.getLong("bytes") && AgentFiles.hash(archive.toPath())==meta.getString("sha256")) { "Runtime archive integrity mismatch" }
            AgentFiles.extract(archive.toPath(),slot.toPath(),meta.getLong("unpackedBytes")+16*1024*1024)
            val manifest=JSONObject(File(slot,".studio-rootfs.json").readText())
            val executable=manifest.getJSONArray("executables")
            for(i in 0 until executable.length()) check(AgentFiles.child(slot.toPath(),executable.getString(i)).toFile().setExecutable(true,true))
            val links=manifest.getJSONObject("links")
            for(name in links.keys())AgentFiles.link(slot.toPath(),name,links.getString(name))
            progress=.6
            val before=homeFingerprint()
            val probe=File(root,"probes/${UUID.randomUUID()}");requireNotNull(probe.parentFile).mkdirs()
            if(home.exists()){
                val probeZip=File(root,"probe-${UUID.randomUUID()}.zip")
                try {AgentFiles.backup(home.toPath(),probeZip.toPath());AgentFiles.restoreHome(probeZip.toPath(),probe.toPath())} finally {probeZip.delete()}
            } else probe.mkdirs()
            runShort(slot,probe,listOf("/usr/local/bin/node","--version"))
            runShort(slot,probe,listOf("/usr/local/bin/node","/opt/agent/seed-home.mjs"))
            // Tests the complete copied user plugin composition, not merely dsh --help.
            val process=spawn(slot,probe,webArgs(),mapOf("STUDIO_BRIDGE_URL" to "http://127.0.0.1:9", "STUDIO_BRIDGE_TOKEN" to "probe-disabled"))
            try { awaitReady(process,120000,false) } finally { terminate(process) }
            // No changes made to live user-home before confirmation.
            check(homeFingerprint()==before) { "User data changed during compatibility check" }
            check(!cancelled) { "Cancelled" }
            proposal=Proposal(UUID.randomUUID().toString(),slot,meta,before,System.currentTimeMillis()+15*60*1000)
            phase="awaiting_confirmation";progress=1.0
            log("Compatibility probe passed. Confirm to back up user data and activate this component.")
        } finally { archive.delete() }
    }
    private fun homeFingerprint(): String {
        if(!home.exists())return "empty"
        val digest=java.security.MessageDigest.getInstance("SHA-256")
        Files.walk(home.toPath()).use { stream -> stream.sorted().forEach { path ->
            if(Files.isSymbolicLink(path)){digest.update(home.toPath().relativize(path).toString().toByteArray());digest.update(Files.readSymbolicLink(path).toString().toByteArray())}
            else if(Files.isRegularFile(path)){digest.update(home.toPath().relativize(path).toString().toByteArray());digest.update(AgentFiles.hash(path).toByteArray())}
        } }
        return digest.digest().joinToString(""){"%02x".format(it)}
    }
    private fun confirm(token: String) {
        val p=proposal ?: error("Prepare a compatible component first")
        check(p.token==token && System.currentTimeMillis()<p.expires && homeFingerprint()==p.before) { "Proposal expired or user data changed; check again" }
        check(child==null);backup();check(!cancelled) { "Cancelled" }
        val metadata=JSONObject(p.seed.toString()).put("slot",p.slot.name)
        AgentFiles.atomicText(activeFile.toPath(),metadata.toString())
        proposal=null;phase="stopped";log("Runtime activated. User files retained. Start explicitly when ready.")
    }
    private fun backup(): File {
        check(child==null)
        val dir=File(root,"backups/${System.currentTimeMillis()}-${UUID.randomUUID()}");dir.mkdirs()
        val zip=File(dir,"user-home.zip")
        AgentFiles.backup(home.toPath(),zip.toPath())
        active()?.let { File(dir,"active.json").writeText(it.toString()) }
        File(dir,"manifest.json").writeText(JSONObject().put("format",1).put("sha256",AgentFiles.hash(zip.toPath())).toString())
        log("Backup created: ${dir.absolutePath}");return dir
    }
    @Synchronized fun backups(): List<String> = File(root,"backups").listFiles()?.filter { File(it,"manifest.json").isFile }?.map { it.name }?.sortedDescending() ?: emptyList()
    @Synchronized fun lockData(): Map<String,String> {
        check(!busy && child==null && portableLock==null) { "Stop Agent before exporting user data" }
        val token=UUID.randomUUID().toString();portableLock=token
        return mapOf("token" to token,"home" to home.absolutePath)
    }
    @Synchronized fun unlockData(token: String) { check(portableLock==token);portableLock=null }
    private fun restore(name: String) {
        require(Regex("[0-9]+-[a-f0-9-]+\\z").matches(name));check(child==null)
        val from=File(root,"backups/$name");val meta=JSONObject(File(from,"manifest.json").readText());val zip=File(from,"user-home.zip")
        check(AgentFiles.hash(zip.toPath())==meta.getString("sha256"))
        val target=File(root,"restore-${UUID.randomUUID()}")
        AgentFiles.restoreHome(zip.toPath(),target.toPath())
        backup()
        val old=File(root,"preserved-${UUID.randomUUID()}")
        if(home.exists())check(home.renameTo(old))
        if(!target.renameTo(home)){if(old.exists())old.renameTo(home);error("Restore activation failed; previous data retained")}
        // Keep current runtime: restoring old data never installs executable content automatically.
        proposal=null;phase="stopped";log("Backup restored. Previous home retained at ${old.absolutePath}. Start explicitly to check plugins.")
    }
    private fun webArgs(): List<String> = listOf("/usr/local/bin/node",CLI,"web","--patch","/studio-home/studio.patch.yml","--patch","/studio-home/studio-community.patch.yml","--patch","/studio-home/studio-roleplay-default.patch.yml","--patch","/studio-home/studio-preview.patch.yml","--patch","/studio-home/studio-data.patch.yml","--no-open","--host","127.0.0.1","--port","0")
    private fun spawn(slot: File,data: File,args: List<String>,bridge: Map<String,String>): Process {
        check(!cancelled) { "Cancelled" }
        val native=File(context.applicationInfo.nativeLibraryDir)
        val libs=File(root,"native-deps");libs.mkdirs()
        for((source,name) in listOf("libtalloc.so" to "libtalloc.so.2","libandroidshmem.so" to "libandroid-shmem.so")){
            val target=File(libs,name);if(!target.exists())File(native,source).copyTo(target);target.setWritable(false,false)
        }
        val temp=File(root,"tmp");temp.mkdirs();data.mkdirs()
        val workspace=if(data==home)File(root,"workspace") else File(data.parentFile,data.name+"-workspace");workspace.mkdirs()
        val cmd=mutableListOf(File(native,"libproot_legacy.so").absolutePath,"-L","--kill-on-exit","-0","--rootfs=${slot.absolutePath}","--cwd=/workspace")
        for(binding in listOf("/dev","/proc","/sys","/system","/apex","${data.absolutePath}:/studio-home","${workspace.absolutePath}:/workspace","/proc/self/fd:/dev/fd"))if(File(binding.substringBefore(':')).exists())cmd.addAll(listOf("--bind",binding))
        cmd.addAll(listOf("/usr/bin/env","-i","HOME=/studio-home","DSH_HOME=/studio-home","DSH_ROLEPLAY_DATA_DIR=/studio-home/roleplay","STUDIO_WORKSPACE=/workspace","STUDIO_DSH_TOOLS=/opt/agent/runtime/node_modules/@deepseek-ai/dsh-tools/lib/index.js","PATH=/usr/local/bin:/usr/bin:/bin","LANG=C.UTF-8","TMPDIR=/tmp"))
        for((key,value) in bridge)cmd.add("$key=$value")
        cmd.addAll(args)
        val dns=(context.getSystemService(Context.CONNECTIVITY_SERVICE) as android.net.ConnectivityManager).let { manager ->
            manager.getLinkProperties(manager.activeNetwork)?.dnsServers?.mapNotNull { it.hostAddress?.substringBefore('%') } ?: emptyList()
        }
        check(dns.isNotEmpty()) { "No active network DNS; connect this phone before starting Agent" }
        AgentFiles.child(slot.toPath(),"etc/resolv.conf").toFile().writeText(dns.joinToString("\n"){"nameserver $it"}+"\n")
        return ProcessBuilder(cmd).redirectErrorStream(true).apply {
            environment()["PROOT_TMP_DIR"]=temp.absolutePath
            environment()["PROOT_LOADER"]=File(native,"libprootloader_legacy.so").absolutePath
            environment()["LD_LIBRARY_PATH"]="${libs.absolutePath}:${native.absolutePath}"
            environment()["PROOT_NO_SECCOMP"]="1"
        }.start().also { auxiliary=it }
    }
    private fun runShort(slot: File,data: File,args: List<String>) {
        val process=spawn(slot,data,args,emptyMap())
        val drain=Thread { process.inputStream.bufferedReader().useLines { lines -> lines.forEach { log(it) } } }.also { it.start() }
        try { check(process.waitFor(90,TimeUnit.SECONDS)) { "Compatibility command timed out" };check(process.exitValue()==0) { "Compatibility command failed (${process.exitValue()})" } }
        finally { terminate(process);drain.join(2000) }
    }
    private fun awaitReady(process: Process, timeout: Long, persist: Boolean): String {
        val found=java.util.concurrent.atomic.AtomicReference<String?>()
        val failed=java.util.concurrent.atomic.AtomicBoolean(false)
        Thread {
            try { process.inputStream.bufferedReader().useLines { lines -> lines.forEach { line ->
                if(line.contains("Failed to load plugins",true) || line.contains("entries did not activate",true))failed.set(true)
                Regex("https?://127\\.0\\.0\\.1:[0-9]+[^\\s\\u001b]*").findAll(line).forEach { match ->
                    val uri=URI(match.value.trimEnd('.',',',')'))
                    if(uri.host=="127.0.0.1" && uri.port in 1024..65535 && uri.userInfo==null)found.set(uri.toString())
                }
                log(line)
            } } } catch (_: Exception) { }
        }.start()
        val deadline=System.currentTimeMillis()+timeout
        while(System.currentTimeMillis()<deadline){
            check(!cancelled) { "Cancelled" }
            check(process.isAlive && !failed.get()) { "Agent exited or plugin compatibility failed; see logs" }
            val url=found.get()
            if(url!=null){
                val uri=URI(url);val connection=URL("http://127.0.0.1:${uri.port}/").openConnection() as HttpURLConnection
                try {connection.connectTimeout=1000;connection.readTimeout=1000;val status=connection.responseCode
                    if(status==200 || status==401){Thread.sleep(1500);check(!failed.get() && process.isAlive);if(persist)launchUrl=url;return url}
                }catch(_:java.io.IOException){}finally{connection.disconnect()}
            }
            Thread.sleep(200)
        }
        error("Agent startup timed out")
    }
    private fun start(args: Map<String,Any?>) {
        val bridgeUrl=args["bridgeUrl"] as? String ?: error("Studio bridge is required")
        val token=args["bridgeToken"] as? String ?: error("Studio bridge is required")
        val uri=URI(bridgeUrl)
        require(uri.scheme=="http" && uri.host=="127.0.0.1" && uri.port in 1024..65535 && uri.rawPath.isNullOrEmpty() && uri.userInfo==null && uri.rawQuery==null)
        require(Regex("[a-f0-9]{64}").matches(token))
        phase="starting";val slot=activeSlot()
        runShort(slot,home,listOf("/usr/local/bin/node","/opt/agent/seed-home.mjs"))
        val process=spawn(slot,home,webArgs(),mapOf("STUDIO_BRIDGE_URL" to bridgeUrl,"STUDIO_BRIDGE_TOKEN" to token))
        child=process
        try { awaitReady(process,120000,true);phase="running" }
        catch(e:Exception){terminate(process);child=null;throw e}
        Thread {
            val code=process.waitFor()
            synchronized(this){if(child===process){child=null;launchUrl=null;phase=if(code==0)"stopped" else "error";log("Agent exited ($code); not automatically restarted")}}
        }.start()
    }
    @Synchronized fun openUrl(): String { check(phase=="running" && child?.isAlive==true);return launchUrl ?: error("Agent is not ready") }
    fun stop() {
        val owned=synchronized(this){
            if(stopping)return
            stopping=true;cancelled=true;val processes=listOfNotNull(child,auxiliary).distinct()
            child=null;auxiliary=null;launchUrl=null;phase="stopped";processes
        }
        try{for(process in owned)terminate(process);log("Agent stopped by user")}
        finally{stopping=false}
    }
    private fun terminate(process: Process) { if(process.isAlive){process.destroy();if(!process.waitFor(5,TimeUnit.SECONDS))process.destroyForcibly()} }
}
