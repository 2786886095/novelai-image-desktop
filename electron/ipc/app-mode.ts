import { app } from "electron";
import path from "path";

/**
 * True when running as the electron-builder "portable" Windows target.
 * electron-builder's portable target self-extracts to a temp dir at runtime
 * and sets this env var to the folder containing the ORIGINAL portable exe —
 * it's the standard way to detect "portable" vs. a real (NSIS) install.
 */
export function isPortableBuild(): boolean {
  return Boolean(process.env.PORTABLE_EXECUTABLE_DIR);
}

/**
 * Directory containing the installed executable. Only meaningful for a real
 * (non-portable) install — for the portable target, app.getPath("exe") points
 * into the temp self-extraction dir, not the original exe's location.
 */
export function installedAppDir(): string {
  return path.dirname(app.getPath("exe"));
}
