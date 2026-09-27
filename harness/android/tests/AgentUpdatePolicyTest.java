import com.codex.novelai.novelai_mobile.agent.AgentUpdatePolicy;
public class AgentUpdatePolicyTest {
    public static void main(String[] args) {
        check("incompatible",AgentUpdatePolicy.decide("official","a","1","b","2","3",false,true,false));
        check("official_failed",AgentUpdatePolicy.decide("official","a","1","b","2","2",true,true,false));
        check("current",AgentUpdatePolicy.decide("official","a","2","b","1","2",false,false,false));
        check("current",AgentUpdatePolicy.decide("component","a","1","a","1","2",false,false,false));
        check("unpublished",AgentUpdatePolicy.decide("component","a","1","b","2","2",false,false,false));
        check("prepare",AgentUpdatePolicy.decide("official","a","1","b","2","2",false,true,false));
        check("prepare",AgentUpdatePolicy.decide("component","a","1","b","2","2",false,false,true));
        System.out.println("UPDATE POLICY PASS: 7 cases; no mismatched official runtime offered; current installs retained.");
    }
    static void check(String want,String actual){if(!want.equals(actual))throw new AssertionError(want+" != "+actual);}
}
