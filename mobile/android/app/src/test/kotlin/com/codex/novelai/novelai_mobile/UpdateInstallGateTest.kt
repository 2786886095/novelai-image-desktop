package com.codex.novelai.novelai_mobile
import org.junit.Assert.*
import org.junit.Test

class UpdateInstallGateTest {
    private val first="a".repeat(48)
    private val second="b".repeat(48)
    @Test fun cancellationInvalidatesHashAndPermissionResume() {
        val gate=UpdateInstallGate();assertTrue(gate.begin(first));assertTrue(gate.cancel(first))
        assertFalse(gate.transition(first,"checking","installer_started"))
        assertFalse(gate.transition(first,"permission_required","checking"))
        gate.fail(first,"late hash error");assertEquals("cancelled",gate.snapshot()["state"])
        assertTrue(gate.begin(second));assertFalse(gate.transition(first,"checking","installer_started"))
    }
    @Test fun systemInstallerRemainsExclusiveUntilClosed() {
        val gate=UpdateInstallGate();gate.begin(first)
        assertTrue(gate.transition(first,"checking","permission_required"));assertFalse(gate.begin(first))
        try {gate.begin(second);fail("accepted concurrent install")}catch(_:IllegalStateException){}
        assertTrue(gate.transition(first,"permission_required","checking"));assertTrue(gate.transition(first,"checking","installer_started"))
        assertFalse(gate.cancel(first));gate.closed();assertTrue(gate.begin(second))
    }
}
