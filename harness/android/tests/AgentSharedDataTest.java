import java.nio.file.*;
import java.util.*;
import com.codex.novelai.novelai_mobile.agent.AgentFiles;
public class AgentSharedDataTest {
 public static void main(String[] args)throws Exception{
  Path root=Files.createTempDirectory("studio-shared-test-"),home=root.resolve("home"),shared=root.resolve("shared");
  Files.createDirectories(home.resolve("sessions"));Files.createDirectories(home.resolve("profiles"));Files.createDirectories(shared);
  Files.writeString(home.resolve("sessions/chat.jsonl"),"OLD");Files.writeString(home.resolve("profiles/user-plugin.js"),"CUSTOM");Files.writeString(shared.resolve("chat.jsonl"),"CURRENT");
  Path zip=root.resolve("backup.zip");AgentFiles.backup(home,zip,Map.of("sessions",shared));Path restored=root.resolve("restored");AgentFiles.restoreHome(zip,restored);
  if(!Files.readString(restored.resolve("sessions/chat.jsonl")).equals("CURRENT"))throw new AssertionError("Stale dialogue backed up");
  if(!Files.readString(restored.resolve("profiles/user-plugin.js")).equals("CUSTOM"))throw new AssertionError("User plugin lost");
  if(!Files.readString(home.resolve("sessions/chat.jsonl")).equals("OLD"))throw new AssertionError("Old data changed");
  try{AgentFiles.backup(home,root.resolve("bad.zip"),Map.of("profiles",shared));throw new AssertionError("Code override accepted");}catch(java.io.IOException expected){}
  System.out.println("SHARED AGENT BACKUP PASS: current dialogues restored; custom plugins and original data retained.");
 }
}
