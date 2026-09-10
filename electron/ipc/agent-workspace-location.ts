import { app, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { AgentWorkspaceLocation } from "../../src/agent/types";
import { resolveSafeWorkspace } from "./agent-workspace-migration";

let cached: (AgentWorkspaceLocation & {sourcePath?: string}) | null = null;

/** Installers replace the executable directory. All active workspaces live in userData. */
export function getAgentWorkspaceLocation(): AgentWorkspaceLocation {
  if (cached) return cached;
  const userData=app.getPath("userData");
  const install=app.isPackaged ? path.dirname(app.getPath("exe")) : undefined;
  const sources=[
    ...(install ? [path.join(install,"LangbaiWorkspace")] : []),
    ...(process.env.PORTABLE_EXECUTABLE_DIR ? [path.join(process.env.PORTABLE_EXECUTABLE_DIR,"LangbaiWorkspace")] : []),
    // Keep an existing app-data workspace as-is; only legacy versions use this name.
    ...(!fs.existsSync(path.join(userData,"LangbaiWorkspace")) ? [path.join(userData,"agent-workspace")] : []),
  ];
  cached=resolveSafeWorkspace(userData,install,sources);
  return cached;
}

export function agentWorkspaceDirectory() { return getAgentWorkspaceLocation().path; }

/** Rebind only attachment paths inside the migrated workspace, never prompt text or external files. */
export function rebaseAgentWorkspaceFile(file: string) {
  getAgentWorkspaceLocation();
  const source=cached?.sourcePath;
  if (!source || !path.isAbsolute(file)) return file;
  const relative=path.relative(source,file);
  if (!relative || relative==='..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return file;
  return path.join(cached!.path,relative);
}

export async function openAgentWorkspaceDirectory() {
  const location=getAgentWorkspaceLocation();
  const message=await shell.openPath(location.path);
  return message ? {ok:false,message} : {ok:true};
}
export function resetAgentWorkspaceLocationForTests() { cached=null; }
