import com.codex.novelai.novelai_mobile.agent.AgentFiles;
import java.nio.file.*;
import java.util.zip.*;
public class AgentFilesTest {
  interface Task {void run() throws Exception;}
  static int tests=0;
  static void check(boolean ok){tests++;if(!ok)throw new AssertionError("case "+tests);}
  static void rejects(Task test)throws Exception{try{test.run();throw new AssertionError("expected rejection");}catch(java.io.IOException expected){tests++;}}
  static Path zip(Path root,String name,String entry,String value)throws Exception{
    Path z=root.resolve(name);try(ZipOutputStream out=new ZipOutputStream(Files.newOutputStream(z))){out.putNextEntry(new ZipEntry(entry));out.write(value.getBytes());out.closeEntry();}return z;
  }
  public static void main(String[] args)throws Exception{
    Path root=Files.createTempDirectory("studio-agent-policy-");
    Path valid=zip(root,"valid.zip","profiles/custom.txt","user-plugin");
    Path home=root.resolve("home");AgentFiles.extract(valid,home,1024);
    check(Files.readString(home.resolve("profiles/custom.txt")).equals("user-plugin"));
    rejects(()->AgentFiles.extract(valid,home,1024));
    rejects(()->AgentFiles.extract(zip(root,"escape.zip","../outside","bad"),root.resolve("escape"),1024));
    check(!Files.exists(root.resolve("outside")));
    rejects(()->AgentFiles.extract(zip(root,"absolute.zip","/outside","bad"),root.resolve("absolute"),1024));
    rejects(()->AgentFiles.extract(valid,root.resolve("limited"),2));
    AgentFiles.atomicText(root.resolve("active.json"),"old");AgentFiles.atomicText(root.resolve("active.json"),"new");
    check(Files.readString(root.resolve("active.json")).equals("new"));
    Path backup=root.resolve("backup.zip");AgentFiles.backup(home,backup);
    AgentFiles.extract(backup,root.resolve("restored"),1024);
    check(AgentFiles.hash(home.resolve("profiles/custom.txt")).equals(AgentFiles.hash(root.resolve("restored/profiles/custom.txt"))));
    rejects(()->AgentFiles.link(home,"bad","../../secret"));
    rejects(()->AgentFiles.child(home,"a/../b"));
    rejects(()->AgentFiles.child(home,"C:/user"));
    System.out.println("ANDROID FILE POLICY PASS: "+tests+" cases; rollback restored user-plugin exactly.");
  }
}
