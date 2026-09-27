import com.codex.novelai.novelai_mobile.agent.AgentVersions;
public class AgentVersionsTest {
 public static void main(String[] args){
  check("0.1.7-rc.2","0.1.5-rc.3","0.1.7-rc.2");
  check("0.1.7","0.1.7","0.1.7-rc.9");
  check("0.1.7-rc.10","0.1.7-rc.2","0.1.7-rc.10");
  check("0.1.7","garbage","0.1.7");
  check("0.1.7","0.1.7","");
  System.out.println("VERSION PASS: 5 cases; next never falsely reported as a downgrade to latest");
 }
 static void check(String expected,String latest,String next){if(!expected.equals(AgentVersions.newest(latest,next)))throw new AssertionError(expected);}
}
