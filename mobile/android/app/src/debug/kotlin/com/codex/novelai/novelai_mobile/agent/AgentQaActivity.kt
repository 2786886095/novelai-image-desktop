package com.codex.novelai.novelai_mobile.agent
import android.app.Activity
import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient

/** Test-only rendering seat. Never included in release APKs. */
class AgentQaActivity: Activity() {
    lateinit var browser: WebView
    override fun onCreate(state: Bundle?){
        super.onCreate(state)
        check(packageName.endsWith(".agenttest"))
        browser=WebView(this)
        browser.settings.javaScriptEnabled=true
        browser.settings.domStorageEnabled=true
        browser.settings.allowFileAccess=false
        browser.settings.allowContentAccess=false
        browser.webViewClient=WebViewClient()
        setContentView(browser)
    }
}
