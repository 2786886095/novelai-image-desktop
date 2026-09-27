package com.codex.novelai.novelai_mobile.agent;

import java.io.*;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.zip.*;

/** No Android dependencies: filesystem policy is tested with real temporary files. */
public final class AgentFiles {
    private AgentFiles() {}
    public static Path child(Path root, String name) throws IOException {
        return child(root,name,false);
    }
    public static Path rootfsChild(Path root,String name)throws IOException {return child(root,name,true);}
    public static void validateName(String name,boolean linuxRootfs)throws IOException {
        if (name.isEmpty() || name.startsWith("/") || name.contains("\\") || (!linuxRootfs && name.contains(":")) || name.matches("^[a-zA-Z]:.*") || name.contains("\0"))
            throw new IOException("Invalid archive path");
        for (String part : name.split("/")) if (part.equals("..") || part.equals(".")) throw new IOException("Invalid path segment");
    }
    private static Path child(Path root,String name,boolean linuxRootfs)throws IOException {
        validateName(name,linuxRootfs);
        Path path = root.resolve(name).normalize();
        if (!path.startsWith(root) || path.equals(root)) throw new IOException("Path escapes root");
        for (Path parent = path; parent != null && parent.startsWith(root); parent = parent.getParent())
            if (Files.isSymbolicLink(parent)) throw new IOException("Path contains a link");
        return path;
    }
    public static String hash(Path file) throws Exception {
        MessageDigest hash = MessageDigest.getInstance("SHA-256");
        try (InputStream in = Files.newInputStream(file)) { byte[] buf = new byte[131072]; int n; while ((n=in.read(buf))!=-1) hash.update(buf,0,n); }
        StringBuilder value = new StringBuilder(); for(byte b:hash.digest())value.append(String.format(Locale.ROOT,"%02x",b & 255)); return value.toString();
    }
    public static void extract(Path zip, Path destination, long limit) throws IOException {
        extract(zip,destination,limit,false);
    }
    public static void extractRootfs(Path zip,Path destination,long limit)throws IOException {
        if(File.separatorChar!='/')throw new IOException("Guest rootfs extraction requires POSIX paths");
        extract(zip,destination,limit,true);
    }
    private static void extract(Path zip, Path destination, long limit,boolean linuxRootfs) throws IOException {
        if (Files.exists(destination, LinkOption.NOFOLLOW_LINKS)) throw new IOException("Destination already exists");
        Files.createDirectories(destination);
        Set<String> seen = new HashSet<>(); long total=0; int count=0;
        try (ZipInputStream in=new ZipInputStream(Files.newInputStream(zip))) {
            ZipEntry entry; byte[] buf=new byte[131072];
            while((entry=in.getNextEntry())!=null) {
                if(++count>150000 || !seen.add(entry.getName()))throw new IOException("Duplicate or excessive entries");
                Path target=child(destination,entry.getName(),linuxRootfs);
                if(entry.isDirectory()){Files.createDirectories(target);continue;}
                Files.createDirectories(target.getParent());
                try(OutputStream out=Files.newOutputStream(target,StandardOpenOption.CREATE_NEW)) {
                    int n; while((n=in.read(buf))!=-1){total+=n;if(total>limit)throw new IOException("Expanded archive exceeds limit");out.write(buf,0,n);}
                }
            }
        }
    }
    /** Links are installed last and always point inside this root, never at host /usr or /etc. */
    public static void link(Path root,String name,String target) throws IOException {
        Path link=child(root,name);
        // Existing symlinks in the target chain are permitted, but lexical escape is not.
        if(target.startsWith("/") || target.contains("\\") || target.contains(":") || target.contains("\0")) throw new IOException("Invalid link target");
        for(String part:target.split("/"))if(part.equals("..") || part.equals("."))throw new IOException("Invalid link target");
        Path to=root.resolve(target).normalize();
        if(!to.startsWith(root)||to.equals(root))throw new IOException("Link escapes root");
        Files.createDirectories(link.getParent());Files.createSymbolicLink(link,link.getParent().relativize(to));
    }
    public static void atomicText(Path file,String text) throws IOException {
        Files.createDirectories(file.getParent());Path temporary=file.resolveSibling(file.getFileName()+".tmp");
        try(FileOutputStream out=new FileOutputStream(temporary.toFile())){out.write(text.getBytes(java.nio.charset.StandardCharsets.UTF_8));out.getFD().sync();}
        Files.move(temporary,file,StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);
    }
    /** Preserve internal npm/plugin links without following them; external links fail closed. */
    public static void backup(Path home,Path zip) throws IOException { backup(home,zip,Collections.emptyMap()); }
    public static void backup(Path home,Path zip,Map<String,Path> overrides) throws IOException {
        for(String name:overrides.keySet())if(!Arrays.asList("roleplay","sessions","mindspace-session-memory").contains(name))throw new IOException("Invalid data override");
        if(Files.isSymbolicLink(home))throw new IOException("Linked Agent home");
        if(Files.exists(home.resolve(".studio-backup.properties")))throw new IOException("Reserved backup manifest exists in home");
        Properties metadata=new Properties();
        long[] size={0};int[] count={0};
        try(ZipOutputStream out=new ZipOutputStream(Files.newOutputStream(zip,StandardOpenOption.CREATE_NEW))){
            if(!Files.exists(home))return;
            Map<String,Path> entries=new LinkedHashMap<>();
            try(java.util.stream.Stream<Path> paths=Files.walk(home)){
                for(Iterator<Path> it=paths.iterator();it.hasNext();){Path f=it.next();if(f.equals(home))continue;
                    String n=home.relativize(f).toString().replace('\\','/');
                    if(!overrides.containsKey(n.split("/",2)[0]))entries.put(n,f);
                }
            }
            for(Map.Entry<String,Path> override:overrides.entrySet()){
                Path base=override.getValue();if(Files.isSymbolicLink(base))throw new IOException("Linked data override");
                if(!Files.isDirectory(base))throw new IOException("Shared data directory missing");
                try(java.util.stream.Stream<Path> paths=Files.walk(base)){
                    for(Iterator<Path> it=paths.iterator();it.hasNext();){Path f=it.next();
                        if(Files.isSymbolicLink(f))throw new IOException("Linked shared data");
                        entries.put(override.getKey()+(f.equals(base)?"":"/"+base.relativize(f).toString().replace('\\','/')),f);
                    }
                }
            }
            {
                for(Map.Entry<String,Path> item:entries.entrySet()){
                    Path file=item.getValue();
                    if(++count[0]>100000)throw new IOException("Too many backup entries");
                    String name=item.getKey();
                    if(Files.isSymbolicLink(file)){
                        Path to=file.getParent().resolve(Files.readSymbolicLink(file)).normalize();
                        if(!to.startsWith(home)||to.equals(home))throw new IOException("Plugin link leaves user data: "+name);
                        metadata.setProperty("link:"+name,home.relativize(to).toString().replace('\\','/'));continue;
                    }
                    if(Files.isDirectory(file)){out.putNextEntry(new ZipEntry(name+"/"));out.closeEntry();continue;}
                    if(!Files.isRegularFile(file))throw new IOException("Unsupported home entry");
                    size[0]+=Files.size(file);if(size[0]>2L*1024*1024*1024)throw new IOException("Backup exceeds 2 GiB");
                    if(Files.isExecutable(file))metadata.setProperty("exec:"+name,"true");
                    out.putNextEntry(new ZipEntry(name));Files.copy(file,out);out.closeEntry();
                }
            }
            out.putNextEntry(new ZipEntry(".studio-backup.properties"));metadata.store(out,"Studio backup v1; internal links only");out.closeEntry();
        }
    }
    public static void restoreHome(Path archive,Path home) throws IOException {
        extract(archive,home,2L*1024*1024*1024);
        Path manifest=home.resolve(".studio-backup.properties");
        if(!Files.exists(manifest))return;
        Properties meta=new Properties();try(InputStream in=Files.newInputStream(manifest)){meta.load(in);}
        for(String name:meta.stringPropertyNames()){
            if(name.startsWith("exec:")){if(!child(home,name.substring(5)).toFile().setExecutable(true,true))throw new IOException("Restore mode failed");}
            else if(!name.startsWith("link:"))throw new IOException("Unsupported backup metadata");
        }
        for(String name:meta.stringPropertyNames())if(name.startsWith("link:"))link(home,name.substring(5),meta.getProperty(name));
        Files.delete(manifest);
    }
}
