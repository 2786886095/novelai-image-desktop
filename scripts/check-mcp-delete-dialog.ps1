param([int]$OwnerPid,[string]$Choice)
$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public class McpFixtureWindow {
 public delegate bool Callback(IntPtr h, IntPtr p);
 [DllImport("user32.dll")] static extern bool EnumWindows(Callback f,IntPtr p);
 [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr h,Callback f,IntPtr p);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h,StringBuilder b,int n);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h,StringBuilder b,int n);
 [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h,uint m,IntPtr w,IntPtr l);
 static string Text(IntPtr h){var b=new StringBuilder(180);GetWindowText(h,b,180);return b.ToString();}
 static string Cls(IntPtr h){var b=new StringBuilder(80);GetClassName(h,b,80);return b.ToString();}
 public static bool Click(uint p,string choice,out string diag){bool found=false;var ds=new List<string>();EnumWindows((h,x)=>{uint id;GetWindowThreadProcessId(h,out id);if(id!=p)return true;
 var title=Text(h);ds.Add(Cls(h)+":"+title);if(title!="MCP 请求永久删除")return true;
 EnumChildWindows(h,(child,y)=>{var name=Text(child).Replace("&","");var c=Cls(child);ds.Add(c+":"+name);
 if(c=="Button" && name==choice){found=PostMessage(child,0x00F5,IntPtr.Zero,IntPtr.Zero);return false;}return true;},IntPtr.Zero);return !found;},IntPtr.Zero);diag=string.Join("|",ds);return found;}
}
"@
$deadline=[DateTime]::UtcNow.AddSeconds(12)
do{$diag="";if([McpFixtureWindow]::Click($OwnerPid,$Choice,[ref]$diag)){exit 0};Start-Sleep -Milliseconds 160}while([DateTime]::UtcNow -lt $deadline)
[Console]::Error.WriteLine("Isolated fixture dialog not found: "+$diag);exit 2
