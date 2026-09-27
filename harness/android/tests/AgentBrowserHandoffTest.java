import com.codex.novelai.novelai_mobile.agent.AgentBrowserHandoff;
import java.net.*;
import java.nio.charset.StandardCharsets;
public class AgentBrowserHandoffTest {
    static int checks=0;
    static void check(boolean b){if(!b)throw new AssertionError("check "+checks);checks++;}
    public static void main(String[] args)throws Exception{
        String target="http://127.0.0.1:34567/?token="+"a".repeat(43);
        try(AgentBrowserHandoff h=new AgentBrowserHandoff(target)){
            String url=h.url();check(!url.contains("token")&&!url.contains("a".repeat(43)));
            HttpURLConnection bad=(HttpURLConnection)new URL(url+"wrong").openConnection();
            check(bad.getResponseCode()==404);bad.disconnect();
            HttpURLConnection c=(HttpURLConnection)new URL(url).openConnection();
            check(c.getResponseCode()==200);
            check("no-store".equals(c.getHeaderField("Cache-Control")));
            check("no-referrer".equals(c.getHeaderField("Referrer-Policy")));
            check(c.getHeaderField("Content-Security-Policy").contains("frame-ancestors 'none'"));
            String html=new String(c.getInputStream().readAllBytes(),StandardCharsets.UTF_8);c.disconnect();
            check(html.contains("location.replace('"+target+"')"));
            Thread.sleep(100);
            try{HttpURLConnection reuse=(HttpURLConnection)new URL(url).openConnection();reuse.setConnectTimeout(1000);reuse.getResponseCode();throw new AssertionError("one-shot listener still open");}catch(java.io.IOException expected){checks++;}
        }
        for(String bad:new String[]{"http://example.com:34567/?token="+"a".repeat(43),"http://127.0.0.1:34567/",target+"&x=1",target+"#x",target.replace("/?","/x?"),target.replace("127.0.0.1","user@127.0.0.1"),target.replace("34567","80")}){
            try(AgentBrowserHandoff ignored=new AgentBrowserHandoff(bad)){throw new AssertionError("invalid URL accepted");}catch(IllegalArgumentException expected){checks++;}
        }
        System.out.println("BROWSER HANDOFF PASS: "+checks+" checks (loopback, token retention, no-store, one-shot, invalid URLs)");
    }
}
