package com.codex.novelai.novelai_mobile

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import java.io.File

/** No custom confirmation dialog; Android owns installation authorization. */
class VerifiedUpdateInstaller(private val activity: Activity) {
    companion object {const val REQUEST_CODE=48126}
    private data class Pending(val id: String,val path: String,val version: String)
    private var pending: Pending? = null
    private val gate=UpdateInstallGate()
    fun status(): Map<String,Any?> {
        @Suppress("DEPRECATION")
        val version=activity.packageManager.getPackageInfo(activity.packageName,0).versionName
        return gate.snapshot()+mapOf("currentVersion" to version)
    }
    fun cancel(id: String): Boolean {
        val accepted=gate.cancel(id)
        if(accepted && pending?.id==id)pending=null
        return accepted
    }
    fun result(requestCode: Int): Boolean {
        if(requestCode!=REQUEST_CODE)return false
        gate.closed();return true
    }
    private fun checked(path: String,version: String): File {
        val root=File(activity.cacheDir,"updates").canonicalFile
        val file=File(path).canonicalFile
        require(file.parentFile==root && file.name.matches(Regex("studio-[a-f0-9]{64}\\.apk")) && file.isFile) { "Invalid update file" }
        val expected=file.name.removePrefix("studio-").removeSuffix(".apk")
        val digest=java.security.MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input -> val buffer=ByteArray(65536);while(true){val n=input.read(buffer);if(n<0)break;digest.update(buffer,0,n)} }
        require(digest.digest().joinToString(""){"%02x".format(it)}==expected) { "Update file changed after verification" }
        @Suppress("DEPRECATION")
        val archive=activity.packageManager.getPackageArchiveInfo(file.path,0) ?: error("Invalid APK")
        require(archive.packageName==activity.packageName) { "Update is for a different application" }
        require(archive.versionName==version) { "APK version differs from the approved version" }
        return file
    }
    fun install(path: String,id: String,version: String,done: (String?, Exception?) -> Unit) {
        try {
            if(!gate.begin(id)){done(gate.snapshot()["state"] as String,null);return}
            verify(Pending(id,path,version),done)
        }catch(error:Exception){done(null,error)}
    }
    private fun verify(request: Pending,done: (String?, Exception?) -> Unit) {
        // Hashing an APK must not block Flutter's platform/UI thread.
        Thread {
            try {
                val file=checked(request.path,request.version)
                activity.runOnUiThread {
                    try {
                        if(Build.VERSION.SDK_INT>=26&&!activity.packageManager.canRequestPackageInstalls()) {
                            check(gate.transition(request.id,"checking","permission_required")){"Update cancelled"}
                            pending=request
                            activity.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:${activity.packageName}")))
                            done("permission_required",null)
                        } else {
                            check(gate.transition(request.id,"checking","installer_started")){"Update cancelled"}
                            pending=null;open(file);done("installer_started",null)
                        }
                    }catch(error:Exception){gate.fail(request.id,error.message);if(pending?.id==request.id)pending=null;done(null,error)}
                }
            }catch(error:Exception){activity.runOnUiThread {gate.fail(request.id,error.message);if(pending?.id==request.id)pending=null;done(null,error)}}
        }.start()
    }
    fun resume() {
        val request=pending ?: return
        if(Build.VERSION.SDK_INT>=26&&!activity.packageManager.canRequestPackageInstalls())return
        if(!gate.transition(request.id,"permission_required","checking"))return
        verify(request) { _,error -> if(error!=null)android.widget.Toast.makeText(activity,error.message,android.widget.Toast.LENGTH_LONG).show() }
    }
    private fun open(file: File) {
        val uri=FileProvider.getUriForFile(activity,"${activity.packageName}.updates",file)
        @Suppress("DEPRECATION")
        activity.startActivityForResult(Intent(Intent.ACTION_INSTALL_PACKAGE).setDataAndType(uri,"application/vnd.android.package-archive")
            .putExtra(Intent.EXTRA_RETURN_RESULT,true).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION),REQUEST_CODE)
    }
}
