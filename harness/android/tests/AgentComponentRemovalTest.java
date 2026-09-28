import com.codex.novelai.novelai_mobile.agent.AgentComponentRemoval;
import java.nio.file.*;
import java.util.*;
public class AgentComponentRemovalTest {
 public static void main(String[] args)throws Exception {
  Path root=Files.createTempDirectory("studio-removal-test-");
  try {
   String name="0.1.7-"+UUID.randomUUID();Path slot=root.resolve("versions/"+name);Files.createDirectories(slot);Files.writeString(slot.resolve(".studio-rootfs.json"),"{}");Files.writeString(slot.resolve("node"),"runtime");
   for(String n:List.of("user-home/sessions/chat.jsonl","user-home/roleplay/card.json","backups/old/data","workspace/image.png","settings.json")){Files.createDirectories(root.resolve(n).getParent());Files.writeString(root.resolve(n),n);}
   AgentComponentRemoval.removeSlot(root,slot);if(Files.exists(slot))throw new AssertionError("runtime remains");
   for(String n:List.of("user-home/sessions/chat.jsonl","user-home/roleplay/card.json","backups/old/data","workspace/image.png","settings.json"))if(!Files.readString(root.resolve(n)).equals(n))throw new AssertionError("data lost");
   boolean refused=false;try{AgentComponentRemoval.removeSlot(root,root.resolve("user-home"));}catch(java.io.IOException e){refused=true;}if(!refused)throw new AssertionError("accepted data path");
   Path cache=Files.createDirectories(root.resolve("downloads"));Files.writeString(cache.resolve("a".repeat(64)+".part"),"partial");Files.writeString(cache.resolve("keep.txt"),"unknown");AgentComponentRemoval.removeDownloads(cache);if(Files.exists(cache.resolve("a".repeat(64)+".part"))||!Files.exists(cache.resolve("keep.txt")))throw new AssertionError("bad cache cleanup");
   Files.createDirectories(slot);Files.writeString(slot.resolve(".studio-rootfs.json"),"{}");Files.writeString(slot.resolve("node"),"reinstalled");if(!Files.readString(root.resolve("user-home/sessions/chat.jsonl")).equals("user-home/sessions/chat.jsonl"))throw new AssertionError("reinstall lost data");
   System.out.println("REMOVAL PASS: runtime removed; five user-data sentinels retained; data-path rejected; unknown cache retained; reinstall retains conversation");
  } finally {try(var paths=Files.walk(root)){for(Path p:paths.sorted(Comparator.reverseOrder()).toList())Files.delete(p);}}
 }
}
