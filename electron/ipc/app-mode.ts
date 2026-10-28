import { app } from "electron";
import path from "path";

/**
 * Directory containing the installed executable. Only meaningful for a real
 * (non-portable) install — for the portable target, app.getPath("exe") points
 * into the temp self-extraction dir, not the original exe's location.
 */
export function installedAppDir(): string {
  return path.dirname(app.getPath("exe"));
}
