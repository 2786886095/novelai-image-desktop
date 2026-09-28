package com.codex.novelai.novelai_mobile.agent;
import java.nio.file.*;
import java.io.IOException;
import java.util.*;
/** Only disposable runtime slots and downloader-owned cache files; never follows links. */
public final class AgentComponentRemoval {
 private static void plain(Path path) throws IOException {
  for(Path p=path.toAbsolutePath().normalize();p!=null;p=p.getParent())if(Files.isSymbolicLink(p))throw new IOException("Linked component path");
 }
 public static void removeSlot(Path root,Path slot) throws IOException {
  root=root.toAbsolutePath().normalize();slot=slot.toAbsolutePath().normalize();
  if(Files.isSymbolicLink(root))throw new IOException("Linked component root");
  if(!slot.getParent().equals(root.resolve("versions")) || !slot.getFileName().toString().matches("[0-9]+\\.[0-9]+\\.[0-9]+(?:-[a-zA-Z0-9.-]+)?-[0-9a-f-]{36}"))throw new IOException("Not a component slot");
  Path relative=root.relativize(slot);root=root.toRealPath();slot=root.resolve(relative);plain(slot.getParent());
  if(Files.isSymbolicLink(slot)||!Files.isRegularFile(slot.resolve(".studio-rootfs.json"),LinkOption.NOFOLLOW_LINKS))throw new IOException("Not a managed rootfs");
  // Materialize before deleting. NO FOLLOW_LINKS: guest /usr links cannot reach user data.
  List<Path> paths=new ArrayList<>();try(var walk=Files.walk(slot)){walk.forEach(paths::add);}
  paths.sort(Comparator.reverseOrder());for(Path file:paths)Files.delete(file);
 }
 public static void removeDownloads(Path directory) throws IOException {
  if(Files.isSymbolicLink(directory))throw new IOException("Linked cache");if(!Files.exists(directory))return;directory=directory.toRealPath();
  try(var stream=Files.list(directory)){for(Iterator<Path> it=stream.iterator();it.hasNext();){Path p=it.next();
   if(p.getFileName().toString().matches("[a-f0-9]{64}\\.(part|json)")&&Files.isRegularFile(p,LinkOption.NOFOLLOW_LINKS))Files.delete(p);
  }}
 }
}
