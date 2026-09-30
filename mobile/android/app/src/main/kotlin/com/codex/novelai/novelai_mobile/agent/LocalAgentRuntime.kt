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
    private fun sharedRoot(): File? {
        val pointer=File(context.filesDir,"unified-storage.json");if(!pointer.isFile)return null
        val directory=File(JSONObject(pointer.readText()).getString("root"))
        check(android.os.Build.VERSION.SDK_INT<30||android.os.Environment.isExternalStorageManager()) { "Shared storage permission was revoked; old data was not substituted" }
        check(File(directory,"storage-manifest.json").isFile) { "Shared data directory missing" }
        return directory
    }
    private val sharedNames=listOf("roleplay","sessions","mindspace-session-memory")
    private fun dataOverrides(): Map<String,java.nio.file.Path> {
        val shared=sharedRoot()?:return emptyMap()
        return sharedNames.associateWith { name -> File(shared,"TavernAgent/data/$name").toPath() }
    }
    private fun backupRoot()=sharedRoot()?.let{File(it,"backups/agent")}?:File(root,"backups")
    private fun downloadRoot()=sharedRoot()?.let{File(it,"models/agent-downloads")}?:File(root,"downloads")
    private var exportSnapshot:File?=null
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
    @Volatile private var stopRevision = 0L
    @Volatile private var portableLock: String? = null
    @Volatile private var launchUrl: String? = null
    private data class DownloadPlan(val token:String,val kind:String,val meta:JSONObject,val expires:Long,val reinstall:Boolean)
    private var downloadConsent:DownloadPlan?=null
    fun planDownload(kind:String,reinstall:Boolean):Map<String,Any?> {
        // Metadata/consent planning does not modify runtime or stop the child.
        // An Agent may approve its own update before Studio takes over.
        synchronized(this){check(!busy && !stopping && portableLock==null);busy=true;downloadConsent=null}
        try {
            require(kind in listOf("component","official"));checkUpdates("both")
            val meta=JSONObject((update ?: seed()).toString());validate(meta)
            check(downloadAvailable) { "Compatible Android runtime has not been published yet; check updates later" }
            if(kind=="official")check(!officialFailed && upstream==meta.getString("upstream")){"No compatible component for the official version"}
            val p=DownloadPlan(UUID.randomUUID().toString(),kind,meta,System.currentTimeMillis()+600000,reinstall)
            synchronized(this){downloadConsent=p}
            return mapOf("token" to p.token,"bytes" to meta.getLong("bytes"),"version" to meta.getString("version"),"sha256" to meta.getString("sha256"))
        } finally {busy=false}
    }
    private var browserHandoff: AgentBrowserHandoff? = null
    @Volatile private var progress = 0.0
    @Volatile private var downloadBytes = 0L
    @Volatile private var downloadTotal = 0L
    @Volatile private var downloadSpeed = 0L
    private val downloader = AgentDownload()
    @Volatile private var upstream = ""
    @Volatile private var update: JSONObject? = null
    @Volatile private var downloadAvailable = false
    @Volatile private var componentFailed=false
    @Volatile private var officialFailed=false
    @Volatile private var componentCheckedAt=0L
    @Volatile private var officialCheckedAt=0L
    @Volatile private var proposal: Proposal? = null
    private data class Proposal(val token: String, val slot: File, val seed: JSONObject, val before: String, val expires: Long, val kind:String)
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
        "phase" to (if(phase=="stopped" && active()==null)"not_installed" else phase), "busy" to (busy || stopping), "error" to error, "progress" to progress,
        "downloadBytes" to downloadBytes, "downloadTotal" to downloadTotal, "downloadSpeed" to downloadSpeed,
        "runtimeBytes" to (update?.optLong("bytes") ?: runCatching{seed().getLong("bytes")}.getOrDefault(0L)),
        "downloadAvailable" to downloadAvailable,
        "componentFailed" to componentFailed,"officialFailed" to officialFailed,
        "componentCheckedAt" to componentCheckedAt,"officialCheckedAt" to officialCheckedAt,
        "running" to (child?.isAlive == true && phase == "running"),
        "stopRevision" to stopRevision,
        "installed" to active()?.optString("version"), "installedUpstream" to active()?.optString("upstream"),
        "official" to upstream, "candidate" to update?.optString("version"),
        "dataDirectory" to home.absolutePath, "backupDirectory" to backupRoot().absolutePath,
        "logs" to logs.toList(), "proposal" to proposal?.let { mapOf("token" to it.token,"version" to it.seed.getString("version"),"upstream" to it.seed.getString("upstream"),"kind" to it.kind) }
    )
    @Synchronized fun command(name: String, args: Map<String, Any?> = emptyMap()) {
        args["expectedStopRevision"]?.let {
            check(it is Number && it.toLong()==stopRevision) { "Agent was stopped after handoff; component operation cancelled" }
        }
        check(!busy && !stopping && portableLock==null) { "Another Agent operation or backup is in progress" }
        require(Build.VERSION.SDK_INT >= 26 && Build.SUPPORTED_ABIS.contains("arm64-v8a")) { "Local Agent requires Android 8+ and ARM64" }
        if (name != "check") check(child == null) { "Stop Agent before changing runtime or data" }
        busy = true; error = null; if(name!="check")cancelled=false
        worker.execute {
            try {
                root.mkdirs()
                when(name) {
                    "check" -> checkUpdates(args["kind"] as? String ?: "both")
                    "prepare" -> prepare(args["kind"] as? String ?: "component",args["downloadToken"] as? String ?: "")
                    "uninstall" -> {check(args["confirmed"]==true);uninstallComponent()}
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
            } finally { downloadSpeed=0;busy = false }
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
        connection.setRequestProperty("User-Agent", "Langbai-Studio-Android/2.4.2")
        try { check(connection.responseCode == 200) { "Update HTTP ${connection.responseCode}" }
            val bytes=connection.inputStream.use { it.readBytesLimited(2*1024*1024) };return String(bytes,Charsets.UTF_8)
        } finally { connection.disconnect() }
    }
    private fun java.io.InputStream.readBytesLimited(limit: Int): ByteArray {
        val out=java.io.ByteArrayOutputStream();val buffer=ByteArray(65536)
        while(true){val n=read(buffer);if(n<0)break;check(out.size()+n<=limit){"Response too large"};out.write(buffer,0,n)}
        return out.toByteArray()
    }
    private fun checkUpdates(kind:String="both") {
        require(kind in listOf("component","official","both"))
        log("Checking Studio Android component and official Harness separately…")
        if(kind!="official"){
        componentFailed=false
        downloadAvailable=false
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
                    val expected=url.substringBeforeLast('/')+"/agent-rootfs.zip"
                    // A descriptor alone is not a downloadable release. Both assets must exist.
                    val archive=(0 until assets.length()).map{assets.getJSONObject(it)}.firstOrNull{
                        it.optString("name")=="agent-rootfs.zip" && it.optString("browser_download_url")==expected && it.optLong("size")==candidate.getLong("bytes")
                    } ?: continue
                    candidate.put("url",archive.getString("browser_download_url"))
                    update=candidate
                    downloadAvailable=true
                    break
                }
                if(downloadAvailable)break
            }
        } catch (_: Exception) { componentFailed=true;log("Studio channel check failed; installed runtime unchanged") }
        componentCheckedAt=System.currentTimeMillis()
        }
        if(kind!="component"){
        officialFailed=false
        try {
            val tags=JSONObject(fetchText("https://registry.npmjs.org/-/package/@deepseek-ai%2Fdsh/dist-tags"))
            upstream=AgentVersions.newest(tags.optString("latest"),tags.optString("next"))
        }
        catch (_: Exception) { officialFailed=true;log("Official Harness check failed; no automatic install") }
        officialCheckedAt=System.currentTimeMillis()
        }
        log("Update checks finished. Changes require a successful compatibility probe and confirmation.")
    }
    private fun prepare(kind:String="component",downloadToken:String) {
        require(kind in listOf("component","official"))
        val approved=downloadConsent;downloadConsent=null
        check(approved!=null && approved.token==downloadToken && approved.kind==kind && System.currentTimeMillis()<approved.expires) { "Download approval expired; confirm again" }
        check(child==null);phase="preparing";proposal=null;progress=0.0
        val meta=approved.meta;validate(meta)
        val cached=File(downloadRoot(),"${meta.getString("sha256")}.part")
        when(AgentUpdatePolicy.decide(kind,active()?.optString("sha256")?:"",active()?.optString("upstream")?:"",meta.getString("sha256"),meta.getString("upstream"),upstream,officialFailed,downloadAvailable,cached.isFile&&cached.length()==meta.getLong("bytes"))){
            "current" -> {if(!approved.reinstall){phase="stopped";log("This component is already installed");return}}
            "official_failed" -> error("Official Harness check failed; no automatic install")
            "incompatible" -> error("No compatible Android component for the latest official Harness; current data retained")
            "unpublished" -> error("Compatible Android runtime has not been published yet; check updates later")
        }
        check(root.usableSpace > meta.getLong("unpackedBytes")*2 + meta.getLong("bytes") + 512L*1024*1024) { "Insufficient free storage" }
        val slot=File(root,"versions/${meta.getString("version")}-${UUID.randomUUID()}")
        val url=meta.optString("url")
        require(url.startsWith("https://github.com/2786886095/novelai-image-desktop/releases/download/agent-v") && url.endsWith("/agent-rootfs.zip")) { "No published compatible runtime download is available" }
        phase="downloading"
        val archive=downloader.fetch(URL(url),downloadRoot().toPath(),meta.getLong("bytes"),meta.getString("sha256"),{cancelled}) { received,total,speed ->
            downloadBytes=received;downloadTotal=total;downloadSpeed=speed
            progress=received.toDouble()/total
        }.toFile()
        phase="preparing";progress=0.5;downloadSpeed=0
        try {
            check(!cancelled) { "Cancelled" }
            AgentFiles.extractRootfs(archive.toPath(),slot.toPath(),meta.getLong("unpackedBytes")+16*1024*1024)
            val manifest=JSONObject(File(slot,".studio-rootfs.json").readText())
            val executable=manifest.getJSONArray("executables")
            for(i in 0 until executable.length()) check(AgentFiles.rootfsChild(slot.toPath(),executable.getString(i)).toFile().setExecutable(true,true))
            val links=manifest.getJSONObject("links")
            for(name in links.keys())AgentFiles.link(slot.toPath(),name,links.getString(name))
            progress=.6
            val before=homeFingerprint()
            val probe=File(root,"probes/${UUID.randomUUID()}");requireNotNull(probe.parentFile).mkdirs()
            if(home.exists()){
                val probeZip=File(root,"probe-${UUID.randomUUID()}.zip")
                try {AgentFiles.backup(home.toPath(),probeZip.toPath(),dataOverrides());AgentFiles.restoreHome(probeZip.toPath(),probe.toPath())} finally {probeZip.delete()}
            } else probe.mkdirs()
            runShort(slot,probe,listOf("/usr/local/bin/node","--version"))
            runShort(slot,probe,listOf("/usr/local/bin/node","/opt/agent/seed-home.mjs"))
            // Tests the complete copied user plugin composition, not merely dsh --help.
            val process=spawn(slot,probe,webArgs(),mapOf("STUDIO_BRIDGE_URL" to "http://127.0.0.1:9", "STUDIO_BRIDGE_TOKEN" to "probe-disabled"))
            try { awaitReady(process,120000,false) } finally { terminate(process) }
            // No changes made to live user-home before confirmation.
            check(homeFingerprint()==before) { "User data changed during compatibility check" }
            check(!cancelled) { "Cancelled" }
            proposal=Proposal(UUID.randomUUID().toString(),slot,meta,before,System.currentTimeMillis()+15*60*1000,kind)
            phase="awaiting_confirmation";progress=1.0
            log("Compatibility probe passed. Confirm to back up user data and activate this component.")
        } finally {
            if(proposal?.slot==slot)archive.delete()
            else discardCandidate(slot)
        }
    }
    private fun uninstallComponent(){
        check(child==null);phase="preparing";proposal=null;downloadConsent=null
        backup();check(!cancelled)
        val versions=File(root,"versions")
        check(!Files.isSymbolicLink(root.toPath()) && !Files.isSymbolicLink(versions.toPath()))
        active()?.let { AgentFiles.atomicText(File(root,"uninstalled.json").toPath(),it.toString()) }
        Files.deleteIfExists(activeFile.toPath())
        for(slot in versions.listFiles() ?: emptyArray()){
            if(Regex("[0-9]+\\.[0-9]+\\.[0-9]+(?:-[a-zA-Z0-9.-]+)?-[0-9a-f-]{36}").matches(slot.name) && File(slot,".studio-rootfs.json").isFile)
                AgentComponentRemoval.removeSlot(root.toPath(),slot.toPath())
        }
        AgentComponentRemoval.removeDownloads(downloadRoot().toPath())
        phase="stopped";log("Component uninstalled; conversations, presets, cards, images, settings and backups retained.")
    }
    private fun discardCandidate(slot:File){
        // Only this transaction's unactivated runtime slot; never user-home/backups.
        if(!slot.exists())return
        check(slot.parentFile.canonicalFile==File(root,"versions").canonicalFile && active()?.optString("slot")!=slot.name && !Files.isSymbolicLink(slot.toPath()))
        Files.walk(slot.toPath()).use{paths->paths.sorted(java.util.Comparator.reverseOrder()).forEach{Files.delete(it)}}
    }
    private fun homeFingerprint(): String {
        if(!home.exists())return "empty"
        val digest=java.security.MessageDigest.getInstance("SHA-256")
        Files.walk(home.toPath()).use { stream -> stream.sorted().forEach { path ->
            if(Files.isSymbolicLink(path)){digest.update(home.toPath().relativize(path).toString().toByteArray());digest.update(Files.readSymbolicLink(path).toString().toByteArray())}
            else if(Files.isRegularFile(path)){digest.update(home.toPath().relativize(path).toString().toByteArray());digest.update(AgentFiles.hash(path).toByteArray())}
        } }
        for((name,base) in dataOverrides())Files.walk(base).use{stream->stream.sorted().filter{Files.isRegularFile(it)}.forEach{file->digest.update((name+base.relativize(file)).toByteArray());digest.update(AgentFiles.hash(file).toByteArray())}}
        return digest.digest().joinToString(""){"%02x".format(it)}
    }
    private fun confirm(token: String) {
        val p=proposal ?: error("Prepare a compatible component first")
        check(p.token==token && System.currentTimeMillis()<p.expires && homeFingerprint()==p.before) { "Proposal expired or user data changed; check again" }
        check(child==null);backup();check(!cancelled) { "Cancelled" }
        // Migrate the same package composition tested by prepare, on a copy.
        // Keep the real home and previous active descriptor intact on failure.
        val staged=File(root,"activation-${UUID.randomUUID()}")
        val snapshot=File(root,"activation-${UUID.randomUUID()}.zip")
        val preserved=File(root,"preserved-update-${UUID.randomUUID()}")
        try {
            AgentFiles.backup(home.toPath(),snapshot.toPath())
            AgentFiles.restoreHome(snapshot.toPath(),staged.toPath())
            runShort(p.slot,staged,listOf("/usr/local/bin/node","/opt/agent/seed-home.mjs"))
            check(!cancelled && homeFingerprint()==p.before) { "User data changed or activation cancelled; prepare again" }
            val metadata=JSONObject(p.seed.toString()).put("slot",p.slot.name)
            AgentHomeActivation.activate(home.toPath(),staged.toPath(),preserved.toPath(),activeFile.toPath(),metadata.toString())
        } finally {snapshot.delete()}
        log("Previous home retained at ${preserved.absolutePath}; update backup is available in Backups & Restore.")
        proposal=null;phase="stopped";log("Runtime activated. User files retained. Start explicitly when ready.")
    }
    private fun backup(): File {
        check(child==null)
        val dir=File(backupRoot(),"${System.currentTimeMillis()}-${UUID.randomUUID()}");dir.mkdirs()
        val zip=File(dir,"user-home.zip")
        AgentFiles.backup(home.toPath(),zip.toPath(),dataOverrides())
        active()?.let { File(dir,"active.json").writeText(it.toString()) }
        File(dir,"manifest.json").writeText(JSONObject().put("format",1).put("sha256",AgentFiles.hash(zip.toPath())).toString())
        log("Backup created: ${dir.absolutePath}");return dir
    }
    @Synchronized fun backups(): List<String> = backupRoot().listFiles()?.filter { File(it,"manifest.json").isFile }?.map { it.name }?.sortedDescending() ?: emptyList()
    @Synchronized fun lockData(): Map<String,String> {
        check(!busy && child==null && portableLock==null) { "Stop Agent before exporting user data" }
        val token=UUID.randomUUID().toString();portableLock=token
        try {
            if(sharedRoot()!=null){
                val copy=File(root,"export-snapshot-${UUID.randomUUID()}");val zip=File(root,"export-${UUID.randomUUID()}.zip")
                try{AgentFiles.backup(home.toPath(),zip.toPath(),dataOverrides());AgentFiles.restoreHome(zip.toPath(),copy.toPath())}finally{zip.delete()}
                exportSnapshot=copy
            }
            return mapOf("token" to token,"home" to (exportSnapshot?:home).absolutePath)
        }catch(error:Exception){portableLock=null;throw error}
    }
    @Synchronized fun unlockData(token: String) {
        check(portableLock==token);portableLock=null
        exportSnapshot?.let{copy->check(copy.parentFile.canonicalFile==root.canonicalFile&&copy.name.startsWith("export-snapshot-"));copy.deleteRecursively()};exportSnapshot=null
    }
    private fun restore(name: String) {
        require(Regex("[0-9]+-[a-f0-9-]+\\z").matches(name));check(child==null)
        val from=File(backupRoot(),name);val meta=JSONObject(File(from,"manifest.json").readText());val zip=File(from,"user-home.zip")
        check(AgentFiles.hash(zip.toPath())==meta.getString("sha256"))
        val target=File(root,"restore-${UUID.randomUUID()}")
        AgentFiles.restoreHome(zip.toPath(),target.toPath())
        backup()
        val shared=sharedRoot();val sharedData=shared?.let{File(it,"TavernAgent/data")}
        val staged=shared?.let{File(it,"TavernAgent/data-restore-${UUID.randomUUID()}")}
        val preserved=shared?.let{File(it,"TavernAgent/data-preserved-${UUID.randomUUID()}")}
        if(staged!=null){
            staged.mkdirs()
            for(name in sharedNames){val source=File(target,name);val dest=File(staged,name)
                if(source.exists()){
                    Files.walk(source.toPath()).use { paths->paths.forEach{check(!Files.isSymbolicLink(it)){"Linked shared backup data"}} }
                    check(source.copyRecursively(dest,overwrite=false))
                    Files.walk(source.toPath()).use { paths->paths.filter{Files.isRegularFile(it)}.forEach{check(AgentFiles.hash(it)==AgentFiles.hash(dest.toPath().resolve(source.toPath().relativize(it))))} }
                }else dest.mkdirs()
            }
        }
        val old=File(root,"preserved-${UUID.randomUUID()}")
        if(home.exists())check(home.renameTo(old))
        try{
            if(sharedData!=null){check(sharedData.renameTo(preserved!!));check(staged!!.renameTo(sharedData))}
            check(target.renameTo(home))
        }catch(error:Exception){
            if(old.exists()&&!home.exists())old.renameTo(home)
            if(preserved?.exists()==true){if(sharedData!!.exists())sharedData.renameTo(File(sharedData.parentFile,"data-failed-${UUID.randomUUID()}"));preserved.renameTo(sharedData)}
            throw error
        }
        // Keep current runtime: restoring old data never installs executable content automatically.
        proposal=null;phase="stopped";log("Backup restored. Previous home retained at ${old.absolutePath}. Start explicitly to check plugins.")
    }
    private fun presentation(slot: File, data: File): File {
        val libraryNames=listOf("package.json","index.js","protocol.js","jev-config.js","lib/client.js")
        val installed=File(data,"profiles/node_modules/@langbai/dsh-studio-library")
        val seeded=File(slot,"opt/agent/plugins/studio-library")
        val baseStandard=libraryNames.all { name ->
            val user=File(installed,name); val original=File(seeded,name)
            user.isFile && original.isFile && user.readBytes().contentEquals(original.readBytes())
        }
        // Match the desktop overlay rule: old seeds may lack the new helper,
        // but a user-supplied/modified helper must not be shadowed.
        val extra="panel-layout-store.js"
        val custom=File(installed,extra);val original=File(seeded,extra)
        val standard=baseStandard && (!custom.exists() || (custom.isFile && original.isFile && custom.readBytes().contentEquals(original.readBytes())))
        val toolsNames=listOf("package.json","index.js")
        val toolsInstalled=File(data,"profiles/node_modules/@langbai/dsh-studio-tools")
        val toolsSeeded=File(slot,"opt/agent/plugins/studio-tools")
        val standardTools=toolsNames.all { name ->
            val user=File(toolsInstalled,name);val original=File(toolsSeeded,name)
            user.isFile && original.isFile && user.readBytes().contentEquals(original.readBytes())
        }
        val names=listOf("package.json","index.js","lib/client.js")+(if(standard)(libraryNames+extra).map {"library/$it"} else emptyList())+(if(standardTools)toolsNames.map {"tools/$it"} else emptyList())
        val sources=names.associateWith { context.assets.open("agent-presentation/$it").use { input -> input.readBytes() } }
        val hash=java.security.MessageDigest.getInstance("SHA-256").apply { update("presentation-tools-disable-insert-v4".toByteArray()) }
        for((name,bytes) in sources){hash.update(name.toByteArray());hash.update(bytes)}
        val directory=File(root,"presentation/"+hash.digest().joinToString(""){"%02x".format(it)})
        // Content-addressed app files, never user-home, profiles, plugins or sessions.
        for((name,bytes) in sources){
            val target=File(directory,name);target.parentFile!!.mkdirs()
            if(!target.exists())target.writeBytes(bytes)
            check(target.readBytes().contentEquals(bytes)){"Presentation component checksum mismatch"}
        }
        val patch=File(directory,"presentation.patch.yml")
        val content="- insert:\n    - id: studio-responsive\n      name: \"/studio-presentation/index.js\"\n" + (if(standard) "- id: studio-library\n  disabled: true\n- insert:\n    - id: studio-library-managed\n      name: \"/studio-presentation/library/index.js\"\n" else "") + (if(standardTools) "- id: studio-tools\n  disabled: true\n- insert:\n    - id: studio-tools-managed\n      name: \"/studio-presentation/tools/index.js\"\n" else "")
        if(!patch.exists())patch.writeText(content)
        check(patch.readText()==content){"Presentation patch checksum mismatch"}
        return directory
    }
    private fun webArgs(): List<String> = listOf("/usr/local/bin/node",CLI,"web","--patch","/studio-home/studio.patch.yml","--patch","/studio-home/studio-community.patch.yml","--patch","/studio-home/studio-roleplay-default.patch.yml","--patch","/studio-home/studio-preview.patch.yml","--patch","/studio-home/studio-data.patch.yml","--patch","/studio-presentation/presentation.patch.yml","--no-open","--host","127.0.0.1","--port","0")
    private fun spawn(slot: File,data: File,args: List<String>,bridge: Map<String,String>): Process {
        check(!cancelled) { "Cancelled" }
        val native=File(context.applicationInfo.nativeLibraryDir)
        val libs=File(root,"native-deps");libs.mkdirs()
        for((source,name) in listOf("libtalloc.so" to "libtalloc.so.2","libandroidshmem.so" to "libandroid-shmem.so")){
            val target=File(libs,name);if(!target.exists())File(native,source).copyTo(target);target.setWritable(false,false)
        }
        val temp=File(root,"tmp");temp.mkdirs();data.mkdirs()
        val workspace=if(data==home)(sharedRoot()?.let{File(it,"TavernAgent/workspace")}?:File(root,"workspace")) else File(data.parentFile,data.name+"-workspace");workspace.mkdirs()
        val cmd=mutableListOf(File(native,"libproot_legacy.so").absolutePath,"-L","--kill-on-exit","-0","--rootfs=${slot.absolutePath}","--cwd=/workspace")
        for(binding in listOf("/dev","/proc","/sys","/system","/apex","${data.absolutePath}:/studio-home","${workspace.absolutePath}:/workspace","${presentation(slot,data).absolutePath}:/studio-presentation","/proc/self/fd:/dev/fd"))if(File(binding.substringBefore(':')).exists())cmd.add("--bind=$binding")
        if(data==home)for((name,source) in dataOverrides()){
            check(source.toFile().isDirectory) { "Shared Agent data directory missing" }
            File(data,name).mkdirs()
            cmd.add("--bind=${source.toFile().absolutePath}:/studio-home/$name")
        }
        // Previous seed is read only by the seed migrator, and only while
        // preparing a NEW slot in an isolated home. No live-home upgrade here.
        val previous=if(data!=home) active()?.let{activeSlot()}?.takeIf{it.canonicalFile!=slot.canonicalFile} else null
        if(previous!=null)cmd.add("--bind=${File(previous,"opt/agent").absolutePath}:/studio-previous-seed")
        cmd.addAll(listOf("/usr/bin/env","-i","HOME=/studio-home","DSH_HOME=/studio-home","DSH_ROLEPLAY_DATA_DIR=/studio-home/roleplay","STUDIO_WORKSPACE=/workspace","STUDIO_DSH_TOOLS=/opt/agent/runtime/node_modules/@deepseek-ai/dsh-tools/lib/index.js","PATH=/usr/local/bin:/usr/bin:/bin","LANG=C.UTF-8","TMPDIR=/tmp"))
        if(previous!=null)cmd.add("STUDIO_PREVIOUS_SEED=/studio-previous-seed")
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
                if(line.contains("Failed to load plugins",true) || line.contains("entries did not activate",true) || line.contains("entry did not activate",true))failed.set(true)
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
    @Synchronized fun browserUrl(): String {
        browserHandoff?.close()
        return AgentBrowserHandoff(openUrl()).also { browserHandoff=it }.url()
    }
    @Synchronized fun openUrl(): String { check(phase=="running" && child?.isAlive==true);return launchUrl ?: error("Agent is not ready") }
    fun stop(): Long {
        val owned=synchronized(this){
            val revision=++stopRevision
            if(stopping)return revision
            stopping=true;cancelled=true;val processes=listOfNotNull(child,auxiliary).distinct()
            browserHandoff?.close();browserHandoff=null
            child=null;auxiliary=null;launchUrl=null;phase="stopped";Pair(revision,processes)
        }
        try{downloader.cancel();for(process in owned.second)terminate(process);log("Agent stopped by user")}
        finally{stopping=false}
        return owned.first
    }
    private fun terminate(process: Process) { if(process.isAlive){process.destroy();if(!process.waitFor(5,TimeUnit.SECONDS))process.destroyForcibly()} }
}
