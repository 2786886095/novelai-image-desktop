package com.codex.novelai.novelai_mobile

/** No Android dependencies: cancellation invalidates asynchronous hash callbacks. */
class UpdateInstallGate {
    private var id: String? = null
    private var state = "idle"
    private var error: String? = null
    @Synchronized fun begin(value: String): Boolean {
        require(value.matches(Regex("[a-f0-9]{48}"))) { "Invalid update operation" }
        if (id == value) return false
        check(state !in listOf("checking", "permission_required", "installer_started")) { "Another system install is pending" }
        id=value;state="checking";error=null;return true
    }
    @Synchronized fun transition(value: String, expected: String, next: String): Boolean {
        if(id!=value || state!=expected)return false
        state=next;return true
    }
    @Synchronized fun cancel(value: String): Boolean {
        if(id!=value)return true
        if(state=="installer_started")return false
        state="cancelled";return true
    }
    @Synchronized fun fail(value: String, message: String?) {
        if(id==value && state!="cancelled"){state="failed";error=message}
    }
    @Synchronized fun closed() {if(state=="installer_started")state="installer_closed"}
    @Synchronized fun snapshot(): Map<String, Any?> = mapOf("id" to id,"state" to state,"error" to error)
}
