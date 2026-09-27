import com.codex.novelai.novelai_mobile.agent.AgentHomeActivation;
import java.nio.file.*;
import java.io.IOException;
import java.util.Comparator;

public class AgentHomeActivationTest {
    public static void main(String[] args) throws Exception {
        Path root=Files.createTempDirectory("studio-activation-test-");
        try {
            for(String scenario:new String[]{"upgrade","first-install","descriptor-failure","existing-preserved"}) {
                Path dir=Files.createDirectory(root.resolve(scenario)),home=dir.resolve("user-home"),stage=Files.createDirectory(dir.resolve("stage")),saved=dir.resolve("preserved"),active=dir.resolve("active.json");
                Files.writeString(stage.resolve("plugin.js"),"fixed official plugin");
                Files.writeString(stage.resolve("custom.js"),"unchanged custom plugin");
                if(!scenario.equals("first-install")){
                    Files.createDirectory(home);Files.writeString(home.resolve("plugin.js"),"old official plugin");
                    Files.writeString(home.resolve("custom.js"),"unchanged custom plugin");
                }
                if(scenario.equals("descriptor-failure"))Files.createDirectory(active);
                if(scenario.equals("existing-preserved"))Files.createDirectory(saved);
                boolean failed=false;
                try {AgentHomeActivation.activate(home,stage,saved,active,"{\"slot\":\"new-slot\"}");}
                catch(IOException expected){failed=true;}
                boolean mustFail=scenario.equals("descriptor-failure")||scenario.equals("existing-preserved");
                if(failed!=mustFail)throw new AssertionError(scenario);
                String expected=mustFail?"old official plugin":"fixed official plugin";
                if(!Files.readString(home.resolve("plugin.js")).equals(expected))throw new AssertionError("home lost: "+scenario);
                if(!Files.readString(home.resolve("custom.js")).equals("unchanged custom plugin"))throw new AssertionError("custom plugin lost");
                if(!mustFail&&!Files.readString(active).equals("{\"slot\":\"new-slot\"}"))throw new AssertionError("wrong active");
                if(scenario.equals("upgrade")&&!Files.readString(saved.resolve("plugin.js")).equals("old official plugin"))throw new AssertionError("backup lost");
            }
            System.out.println("ACTIVATION PASS: 4 cases; custom files retained; failed descriptor write restores previous home.");
        } finally {try(var files=Files.walk(root)){for(Path file:files.sorted(Comparator.reverseOrder()).toList())Files.delete(file);}}
    }
}
