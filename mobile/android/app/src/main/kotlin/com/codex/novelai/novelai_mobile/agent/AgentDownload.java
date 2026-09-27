package com.codex.novelai.novelai_mobile.agent;

import java.io.*;
import java.net.*;
import java.nio.file.*;
import java.util.function.BooleanSupplier;

/** Hash-addressed resumable download. No runtime activation or user-home access. */
public final class AgentDownload {
    public interface Progress { void update(long received, long total, long bytesPerSecond); }
    private volatile HttpURLConnection connection;
    public void cancel() { HttpURLConnection c=connection; if(c!=null)c.disconnect(); }
    private static void ensure(boolean condition,String message) throws IOException {
        if(!condition)throw new IOException(message);
    }
    public Path fetch(URL url, Path directory, long size, String hash,
                      BooleanSupplier cancelled, Progress progress) throws Exception {
        ensure(size>0 && size<=1_500_000_000L && hash.matches("[a-f0-9]{64}"),"Invalid download descriptor");
        Files.createDirectories(directory);
        Path part=directory.resolve(hash+".part");
        ensure(!Files.isSymbolicLink(part),"Download cache cannot be a link");
        if(Files.exists(part) && Files.size(part)>size)Files.delete(part);
        long offset=Files.exists(part)?Files.size(part):0;
        progress.update(offset,size,0);
        if(offset<size){
            URL current=url;
            try {
                for(int redirects=0;;redirects++) {
                    ensure(!cancelled.getAsBoolean(),"Cancelled");
                    HttpURLConnection c=(HttpURLConnection)current.openConnection(); connection=c;
                    c.setConnectTimeout(20000);c.setReadTimeout(30000);c.setInstanceFollowRedirects(false);
                    c.setRequestProperty("Accept-Encoding","identity");
                    c.setRequestProperty("User-Agent","Langbai-Studio-Android/2.4.0");
                    if(offset>0)c.setRequestProperty("Range","bytes="+offset+"-");
                    int code=c.getResponseCode();
                    if(code==301||code==302||code==303||code==307||code==308){
                        ensure(redirects<5,"Too many download redirects");
                        String location=c.getHeaderField("Location");ensure(location!=null,"Missing redirect");
                        URL next=new URL(current,location);
                        ensure(next.getProtocol().equals("https") || (url.getProtocol().equals("http") && next.getProtocol().equals("http")),"Insecure download redirect");
                        c.disconnect();current=next;continue;
                    }
                    ensure(code==200||code==206,"Download HTTP "+code);
                    long start=code==200?0:offset;
                    if(code==206)ensure(("bytes "+start+"-"+(size-1)+"/"+size).equals(c.getHeaderField("Content-Range")),"Invalid download range");
                    String encoding=c.getHeaderField("Content-Encoding");
                    ensure(encoding==null||encoding.equals("identity"),"Unexpected download encoding");
                    long length=c.getContentLengthLong();
                    ensure(length<0||length==size-start,"Download size mismatch");
                    long received=start,begin=System.nanoTime(),last=0;
                    try(InputStream in=c.getInputStream(); FileOutputStream out=new FileOutputStream(part.toFile(),start>0)){
                        byte[] buffer=new byte[131072]; int n;
                        while((n=in.read(buffer))!=-1){
                            ensure(!cancelled.getAsBoolean(),"Cancelled");
                            if(received+n>size){out.close();Files.deleteIfExists(part);throw new IOException("Download exceeds expected size");}
                            out.write(buffer,0,n);received+=n;
                            long now=System.nanoTime();
                            if(now-last>200_000_000L){progress.update(received,size,(long)((received-start)*1e9/Math.max(1,now-begin)));last=now;}
                        }
                        out.getFD().sync();
                    }
                    ensure(received==size,"Download interrupted; retry to resume");
                    break;
                }
            } finally { HttpURLConnection c=connection;connection=null;if(c!=null)c.disconnect(); }
        }
        ensure(!cancelled.getAsBoolean(),"Cancelled");
        if(!AgentFiles.hash(part).equals(hash)){Files.deleteIfExists(part);throw new IOException("Runtime archive integrity mismatch");}
        progress.update(size,size,0);
        return part;
    }
}
