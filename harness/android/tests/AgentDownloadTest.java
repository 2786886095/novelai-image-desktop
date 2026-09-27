import com.codex.novelai.novelai_mobile.agent.*;
import com.sun.net.httpserver.HttpServer;
import java.net.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.atomic.*;
public class AgentDownloadTest {
 public static void main(String[] args)throws Exception{
  Path root=Files.createTempDirectory("agent-http-");
  byte[] payload=new byte[400000];new Random(42).nextBytes(payload);
  Path fixture=root.resolve("fixture");Files.write(fixture,payload);String hash=AgentFiles.hash(fixture);
  HttpServer server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
  AtomicInteger mode=new AtomicInteger(),requests=new AtomicInteger();AtomicReference<String> range=new AtomicReference<>();
  server.createContext("/runtime",exchange->{
   requests.incrementAndGet();String header=exchange.getRequestHeaders().getFirst("Range");range.set(header);
   int start=header==null?0:Integer.parseInt(header.substring(6,header.length()-1));
   int status=header==null?200:206;
   if(mode.get()==1){start=0;status=200;} // CDN ignores Range: must truncate, not append.
   if(mode.get()==2){exchange.sendResponseHeaders(503,-1);exchange.close();return;}
   if(status==206)exchange.getResponseHeaders().set("Content-Range","bytes "+(mode.get()==3?start+1:start)+"-"+(payload.length-1)+"/"+payload.length);
   exchange.sendResponseHeaders(status,payload.length-start);
   try(var out=exchange.getResponseBody()){out.write(payload,start,payload.length-start);}finally{exchange.close();}
  });server.start();
  URL url=new URL("http://127.0.0.1:"+server.getAddress().getPort()+"/runtime");
  AgentDownload d=new AgentDownload();AtomicLong progress=new AtomicLong();
  AgentDownload.Progress report=(n,total,speed)->progress.set(n);
  try{
   AgentFiles.validateName("var/lib/dpkg/info/libc6:arm64.list",true);
   fails(()->AgentFiles.validateName("var/lib/dpkg/info/libc6:arm64.list",false));
   fails(()->AgentFiles.validateName("C:/escape",true));
   fails(()->AgentFiles.validateName("var/../escape",true));
   Path cache=root.resolve("cache");Path result=d.fetch(url,cache,payload.length,hash,()->false,report);
   check(AgentFiles.hash(result).equals(hash)&&progress.get()==payload.length,"fresh checksum/progress");
   int count=requests.get();d.fetch(url,cache,payload.length,hash,()->false,report);check(requests.get()==count,"cache avoids redownload");
   Files.write(result,Arrays.copyOf(payload,12345));d.fetch(url,cache,payload.length,hash,()->false,report);check("bytes=12345-".equals(range.get()),"resume range");
   Files.write(result,Arrays.copyOf(payload,123));mode.set(1);d.fetch(url,cache,payload.length,hash,()->false,report);check(AgentFiles.hash(result).equals(hash),"range ignored restarts");
   Files.write(result,Arrays.copyOf(payload,123));mode.set(2);fails(()->d.fetch(url,cache,payload.length,hash,()->false,report));check(Files.size(result)==123,"HTTP failure preserves partial");
   mode.set(3);fails(()->d.fetch(url,cache,payload.length,hash,()->false,report));check(Files.size(result)==123,"bad range leaves partial unchanged");
   mode.set(0);fails(()->d.fetch(url,cache,payload.length,hash,()->true,report));check(Files.size(result)==123,"cancel preserves partial");
   String wrong="a".repeat(64);fails(()->d.fetch(url,cache,payload.length,wrong,()->false,report));check(!Files.exists(cache.resolve(wrong+".part")),"bad checksum discarded");
   System.out.println("DOWNLOAD PASS: 8 checks (fresh, cache, resume, restart, HTTP, range, cancel, checksum)");
  }finally{server.stop(0);}
 }
 interface Checked{void run()throws Exception;}
 static void fails(Checked action)throws Exception{try{action.run();}catch(Exception expected){return;}throw new AssertionError("Expected failure");}
 static void check(boolean b,String text){if(!b)throw new AssertionError(text);}
}
