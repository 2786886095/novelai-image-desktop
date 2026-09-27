package com.codex.novelai.novelai_mobile

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.Handler
import android.os.Looper
import android.util.Base64
import io.flutter.plugin.common.MethodChannel
import java.io.File

/** Playback only; never records audio. One player, ten seconds maximum. */
class CompletionAudio(private val context: Context) {
    private var player: MediaPlayer?=null
    private val handler=Handler(Looper.getMainLooper())
    private var temp:File?=null
    private var pending:((Boolean)->Unit)?=null
    fun stop(){val reply=pending;pending=null;reply?.invoke(false);handler.removeCallbacksAndMessages(null);player?.release();player=null;temp?.delete();temp=null}
    fun play(data:String,volume:Double,result:MethodChannel.Result){
        stop()
        try {
            require(data.length<=1500000 && Regex("^data:audio/(mpeg|mp3|wav|x-wav|wave|ogg);base64,[a-zA-Z0-9+/=]+$").matches(data))
            val bytes=Base64.decode(data.substringAfter(','),Base64.DEFAULT);require(bytes.size in 1..1048576)
            require(volume.isFinite() && volume in 0.0..1.0)
            val file=File.createTempFile("completion-",".audio",context.cacheDir);temp=file;file.writeBytes(bytes)
            val p=MediaPlayer();player=p
            p.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
            p.setDataSource(file.absolutePath);p.setVolume(volume.toFloat(),volume.toFloat())
            var replied=false
            fun reply(ok:Boolean){if(!replied){replied=true;pending=null;result.success(ok)}}
            pending=::reply
            p.setOnPreparedListener {if(player===it){it.start();reply(true);handler.postDelayed({if(player===p)stop()},10000)}}
            p.setOnCompletionListener {if(player===it)stop()}
            p.setOnErrorListener {_,_,_->reply(false);if(player===p)stop();true}
            handler.postDelayed({if(player===p&&!replied){reply(false);stop()}},5000)
            p.prepareAsync()
        }catch(error:Exception){val waiting=pending!=null;stop();if(!waiting)result.success(false)}
    }
}
