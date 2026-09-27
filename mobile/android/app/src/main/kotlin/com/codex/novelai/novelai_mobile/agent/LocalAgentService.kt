package com.codex.novelai.novelai_mobile.agent

import android.app.*
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.*
import com.codex.novelai.novelai_mobile.MainActivity

/** User-started only. Never auto-resumes a paid request after OS process death. */
class LocalAgentService : Service() {
    private val handler=Handler(Looper.getMainLooper())
    private var wake: PowerManager.WakeLock?=null
    private var started=0L
    private val watch=object: Runnable { override fun run() {
        val state=LocalAgentRuntime.get(this@LocalAgentService).snapshot()
        if(System.currentTimeMillis()-started>5000 && state["busy"]!=true && state["running"]!=true){stopSelf();return}
        handler.postDelayed(this,2000)
    } }
    override fun onBind(intent: Intent?) = null
    override fun onStartCommand(intent: Intent?,flags: Int,startId: Int): Int {
        if(intent?.action=="stop"){Thread {LocalAgentRuntime.get(this).stop();handler.post{stopSelf()}}.start();return START_NOT_STICKY}
        started=System.currentTimeMillis()
        val manager=getSystemService(NotificationManager::class.java)
        val title=intent?.getStringExtra("title") ?: "Local Tavern Agent"
        manager.createNotificationChannel(NotificationChannel("local-agent",title,NotificationManager.IMPORTANCE_LOW))
        val open=PendingIntent.getActivity(this,2307,Intent(this,MainActivity::class.java),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val stop=PendingIntent.getService(this,2308,Intent(this,LocalAgentService::class.java).setAction("stop"),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification=Notification.Builder(this,"local-agent").setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title).setContentText(intent?.getStringExtra("body") ?: "Runs on this phone. Tap to return to Studio.")
            .setContentIntent(open).setOngoing(true).addAction(Notification.Action.Builder(null,intent?.getStringExtra("stop") ?: "Stop",stop).build()).build()
        if(Build.VERSION.SDK_INT>=34) startForeground(2307,notification,ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE) else startForeground(2307,notification)
        if(wake==null)wake=(getSystemService(POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"studio:local-agent").apply { acquire(6*60*60*1000L) }
        handler.removeCallbacks(watch);handler.postDelayed(watch,2000)
        return START_NOT_STICKY
    }
    override fun onDestroy(){handler.removeCallbacks(watch);val agent=LocalAgentRuntime.get(this);val state=agent.snapshot();if(state["busy"]==true||state["running"]==true)Thread{agent.stop()}.start();wake?.let{if(it.isHeld)it.release()};wake=null;super.onDestroy()}
}
