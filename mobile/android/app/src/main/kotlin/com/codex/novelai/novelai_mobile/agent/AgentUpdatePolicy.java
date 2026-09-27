package com.codex.novelai.novelai_mobile.agent;

/** Never advertise an upstream-only release as a compatible Android payload. */
public final class AgentUpdatePolicy {
    private AgentUpdatePolicy() {}
    public static String decide(String kind, String installedSha, String installedUpstream,
            String candidateSha, String candidateUpstream, String official,
            boolean officialFailed, boolean downloadable, boolean cached) {
        if (!kind.equals("official") && !kind.equals("component")) throw new IllegalArgumentException("Unknown update kind");
        if (kind.equals("official")) {
            if (officialFailed || official.isEmpty()) return "official_failed";
            if (official.equals(installedUpstream)) return "current";
            if (!official.equals(candidateUpstream)) return "incompatible";
        }
        if (!installedSha.isEmpty() && installedSha.equals(candidateSha)) return "current";
        if (!downloadable && !cached) return "unpublished";
        return "prepare";
    }
}
