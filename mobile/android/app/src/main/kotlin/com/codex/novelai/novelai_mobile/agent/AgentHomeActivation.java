package com.codex.novelai.novelai_mobile.agent;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/** Publish a successfully prepared home; never delete the prior home. */
public final class AgentHomeActivation {
    private AgentHomeActivation() {}
    public static void activate(Path home, Path staged, Path preserved, Path active, String metadata) throws IOException {
        Path root=home.toAbsolutePath().normalize().getParent();
        for(Path target:new Path[]{home,staged,preserved,active}) {
            if(!target.toAbsolutePath().normalize().getParent().equals(root)||Files.isSymbolicLink(target))
                throw new IOException("Invalid activation path");
        }
        if(!Files.isDirectory(staged)||Files.exists(preserved))throw new IOException("Invalid activation staging state");
        boolean moved=false,published=false;
        try {
            if(Files.exists(home)){Files.move(home,preserved);moved=true;}
            Files.move(staged,home);published=true;
            AgentFiles.atomicText(active,metadata);
        } catch(IOException error) {
            try {
                if(published)Files.move(home,staged);
                if(moved)Files.move(preserved,home);
            } catch(IOException recovery) {error.addSuppressed(recovery);}
            throw error;
        }
    }
}
