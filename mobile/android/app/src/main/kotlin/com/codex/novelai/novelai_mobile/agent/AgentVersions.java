package com.codex.novelai.novelai_mobile.agent;
import java.math.BigInteger;
/** Same release-channel policy as desktop: consider latest and next, never alpha. */
public final class AgentVersions {
 private static boolean valid(String v){return v!=null&&v.matches("[0-9]+\\.[0-9]+\\.[0-9]+(?:-[a-zA-Z0-9.-]+)?");}
 public static String newest(String latest,String next){
  if(!valid(latest)){if(!valid(next))throw new IllegalArgumentException("Invalid official version");return next;}
  return valid(next)&&compare(next,latest)>0?next:latest;
 }
 private static int compare(String a,String b){
  String[] av=a.split("-",2),bv=b.split("-",2),an=av[0].split("\\."),bn=bv[0].split("\\.");
  for(int i=0;i<3;i++){int c=new BigInteger(an[i]).compareTo(new BigInteger(bn[i]));if(c!=0)return c;}
  if(av.length!=bv.length)return av.length==1?1:-1;
  if(av.length==1)return 0;
  String[] ap=av[1].split("\\."),bp=bv[1].split("\\.");
  for(int i=0;i<Math.min(ap.length,bp.length);i++){
   boolean x=ap[i].matches("[0-9]+"),y=bp[i].matches("[0-9]+");
   int c=x&&y?new BigInteger(ap[i]).compareTo(new BigInteger(bp[i])):x!=y?(x?-1:1):ap[i].compareTo(bp[i]);
   if(c!=0)return c;
  }
  return Integer.compare(ap.length,bp.length);
 }
}
