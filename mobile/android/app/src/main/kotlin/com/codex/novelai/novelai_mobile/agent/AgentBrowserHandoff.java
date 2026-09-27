package com.codex.novelai.novelai_mobile.agent;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;

/** Establish a loopback browser document before navigating to Harness's authenticated URL.
 * The launch credential stays in memory; never relax Harness authentication or cookie policy. */
public final class AgentBrowserHandoff implements AutoCloseable {
    private final ServerSocket server;
    private final String path;
    private final String target;
    public AgentBrowserHandoff(String target) throws IOException {
        URI uri=URI.create(target);
        if(!"http".equals(uri.getScheme()) || !"127.0.0.1".equals(uri.getHost()) ||
            uri.getPort()<1024 || uri.getPort()>65535 || uri.getUserInfo()!=null ||
            !"/".equals(uri.getPath()) || uri.getFragment()!=null ||
            uri.getRawQuery()==null || !uri.getRawQuery().matches("token=[A-Za-z0-9_-]{32,256}"))
            throw new IllegalArgumentException("Invalid Agent browser launch URL");
        this.target=target;
        byte[] random=new byte[32];new SecureRandom().nextBytes(random);
        path="/open/"+Base64.getUrlEncoder().withoutPadding().encodeToString(random);
        server=new ServerSocket(0,4,InetAddress.getByName("127.0.0.1"));
        server.setSoTimeout(1000);
        Thread thread=new Thread(this::serve,"studio-browser-handoff");thread.setDaemon(true);thread.start();
    }
    public String url(){return "http://127.0.0.1:"+server.getLocalPort()+path;}
    private void serve(){
        long deadline=System.nanoTime()+90_000_000_000L;
        try {
            while(!server.isClosed() && System.nanoTime()<deadline){
                try(Socket socket=server.accept()){
                    socket.setSoTimeout(2000);
                    InputStream in=socket.getInputStream();ByteArrayOutputStream bytes=new ByteArrayOutputStream();
                    int b;while(bytes.size()<16384 && (b=in.read())!=-1){bytes.write(b);int n=bytes.size();
                        if(b==10 && n>=4){byte[] a=bytes.toByteArray();if(a[n-4]==13&&a[n-3]==10&&a[n-2]==13)break;}}
                    String request=bytes.toString(StandardCharsets.US_ASCII.name());
                    String[] lines=request.split("\r\n");
                    boolean host=false;for(String line:lines)if(line.equalsIgnoreCase("Host: 127.0.0.1:"+server.getLocalPort()))host=true;
                    boolean valid=host && lines.length>0 && lines[0].equals("GET "+path+" HTTP/1.1") && request.endsWith("\r\n\r\n");
                    String html=valid?"<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width'><title>Studio Agent</title><a href='"+target+"'>Open Agent</a><script nonce='studio'>location.replace('"+target+"')</script>":"Not found";
                    byte[] body=html.getBytes(StandardCharsets.UTF_8);
                    String headers="HTTP/1.1 "+(valid?"200 OK":"404 Not Found")+"\r\nContent-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nX-Content-Type-Options: nosniff\r\nContent-Security-Policy: default-src 'none'; script-src 'nonce-studio'; frame-ancestors 'none'; base-uri 'none'\r\nConnection: close\r\nContent-Length: "+body.length+"\r\n\r\n";
                    socket.getOutputStream().write(headers.getBytes(StandardCharsets.US_ASCII));socket.getOutputStream().write(body);
                    if(valid)break;
                }catch(SocketTimeoutException ignored){}catch(IOException ignored){}
            }
        }finally{close();}
    }
    @Override public void close(){try{server.close();}catch(IOException ignored){}}
}
