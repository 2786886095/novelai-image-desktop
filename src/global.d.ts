import type { NaiDesktopApi } from "./types";
import type { ComfyLocalApi } from "./comfyui/contract";

declare global {
  interface Window {
    naiDesktop: NaiDesktopApi;
    naiComfy?: ComfyLocalApi;
  }
}

export {};
