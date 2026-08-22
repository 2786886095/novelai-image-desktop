// Cohesive line-icon set (Feather-style, 24px grid, stroke = currentColor).
// Replaces the clashing color emoji so every functional glyph shares one look
// and inherits the surrounding text color / size (1em).
import clsx from "clsx";
import type { ReactNode } from "react";

export type IconName =
  | "lock"
  | "unlock"
  | "bulb"
  | "globe"
  | "folder"
  | "folderOpen"
  | "palette"
  | "paw"
  | "plug"
  | "link"
  | "sparkles"
  | "star"
  | "dice"
  | "pin"
  | "key"
  | "mapPin"
  | "trash"
  | "upgrade"
  | "download"
  | "copy"
  | "warning"
  | "eye"
  | "eyeOff"
  | "settings"
  | "help"
  | "refresh"
  | "check"
  | "close"
  | "plus"
  | "clear"
  | "externalLink"
  | "play"
  | "brush"
  | "eraser"
  | "scan"
  | "swap"
  | "arrowDownLeft"
  | "logout"
  | "image"
  | "images"
  | "history"
  | "toolbox"
  | "fileSearch"
  | "wand"
  | "minus"
  | "maximize"
  | "minimize"
  | "chevronDown"
  | "search"
  | "info"
  | "successCircle"
  | "user"
  | "loader"
  | "sliders"
  | "chevronRight";

const PATHS: Record<IconName, ReactNode> = {
  lock: (
    <>
      <rect x="3.5" y="11" width="17" height="10.5" rx="2.2" />
      <path d="M7.5 11V7.5a4.5 4.5 0 0 1 9 0V11" />
    </>
  ),
  unlock: (
    <>
      <rect x="3.5" y="11" width="17" height="10.5" rx="2.2" />
      <path d="M7.5 11V7.5a4.5 4.5 0 0 1 8.7-1.6" />
    </>
  ),
  bulb: (
    <>
      <path d="M9.5 18.5h5" />
      <path d="M10 21.5h4" />
      <path d="M12 2.5a6.5 6.5 0 0 0-4 11.7c.6.5 1 1.2 1 2v.3h6v-.3c0-.8.4-1.5 1-2A6.5 6.5 0 0 0 12 2.5Z" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.8 2.4 4.2 5.6 4.2 9S14.8 18.6 12 21c-2.8-2.4-4.2-5.6-4.2-9S9.2 5.4 12 3Z" />
    </>
  ),
  folder: <path d="M3.5 7a2 2 0 0 1 2-2H9l2 2h7.5a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" />,
  folderOpen: (
    <>
      <path d="M3.5 7a2 2 0 0 1 2-2H9l2 2h7.5a2 2 0 0 1 2 2v1.5h-15" />
      <path d="M3.6 10.5h17.2l-1.8 7.2a1.5 1.5 0 0 1-1.45 1.1H6.85A1.5 1.5 0 0 1 5.4 17.7Z" />
    </>
  ),
  palette: (
    <>
      <path d="M12 3.2a8.8 8.8 0 1 0 0 17.6c1 0 1.6-.8 1.6-1.6 0-.4-.2-.8-.5-1.1-.3-.3-.5-.7-.5-1.1 0-.8.7-1.4 1.6-1.4h2A4.8 4.8 0 0 0 21 10.8c0-4.2-4-7.6-9-7.6Z" />
      <circle cx="7.5" cy="12" r="1" />
      <circle cx="10" cy="8" r="1" />
      <circle cx="14.5" cy="8" r="1" />
    </>
  ),
  paw: (
    <>
      <ellipse cx="6.5" cy="11" rx="1.7" ry="2" />
      <ellipse cx="10" cy="7.6" rx="1.7" ry="2" />
      <ellipse cx="14" cy="7.6" rx="1.7" ry="2" />
      <ellipse cx="17.5" cy="11" rx="1.7" ry="2" />
      <path d="M8.8 15.2c0-1.7 1.4-2.6 3.2-2.6s3.2.9 3.2 2.6c0 1.5-1.1 2.1-2 2.8-.5.4-.8 1.1-1.2 1.1s-.7-.7-1.2-1.1c-.9-.7-2-1.3-2-2.8Z" />
    </>
  ),
  plug: (
    <>
      <path d="M9 2.5v5" />
      <path d="M15 2.5v5" />
      <path d="M7 7.5h10v3.2a5 5 0 0 1-10 0Z" />
      <path d="M12 15.7V21.5" />
    </>
  ),
  link: (
    <>
      <path d="M10.2 13.8a3.8 3.8 0 0 0 5.4 0l2.7-2.7a3.8 3.8 0 0 0-5.4-5.4l-1.4 1.4" />
      <path d="M13.8 10.2a3.8 3.8 0 0 0-5.4 0l-2.7 2.7a3.8 3.8 0 0 0 5.4 5.4l1.4-1.4" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 3.5l1.6 4.6 4.6 1.6-4.6 1.6L12 16l-1.6-4.7L5.8 9.7l4.6-1.6Z" />
      <path d="M18 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7Z" />
    </>
  ),
  star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2-4.5-4.4 6.2-.9Z" />,
  dice: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3.2" />
      <circle cx="8.8" cy="8.8" r="1" />
      <circle cx="15.2" cy="8.8" r="1" />
      <circle cx="8.8" cy="15.2" r="1" />
      <circle cx="15.2" cy="15.2" r="1" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  pin: (
    <>
      <path d="M9 3.5h6l-1 5.5 2.5 2.5v1.5h-9V11l2.5-2.5Z" />
      <path d="M12 14.5v6" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="14" r="4" />
      <path d="M10.8 11.2 20 2" />
      <path d="M17 5l2.2 2.2" />
      <path d="M14.2 7.8 16.4 10" />
    </>
  ),
  mapPin: (
    <>
      <path d="M12 2.5a7 7 0 0 0-7 7c0 5 7 12 7 12s7-7 7-12a7 7 0 0 0-7-7Z" />
      <circle cx="12" cy="9.3" r="2.5" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V5.2a1.2 1.2 0 0 1 1.2-1.2h3.6A1.2 1.2 0 0 1 15 5.2V7" />
      <path d="M6.2 7l.9 12.6a1.2 1.2 0 0 0 1.2 1.1h7.4a1.2 1.2 0 0 0 1.2-1.1L18 7" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  upgrade: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16.5V8" />
      <path d="M8.5 11.5 12 8l3.5 3.5" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12" />
      <path d="M7.5 10.5 12 15l4.5-4.5" />
      <path d="M4.5 20.5h15" />
    </>
  ),
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </>
  ),
  warning: (
    <>
      <path d="M12 3.5 21 19.5H3Z" />
      <path d="M12 10v4.2" />
      <path d="M12 17.4h.01" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M3 3l18 18" />
      <path d="M10.6 5.6c.45-.07.9-.1 1.4-.1 6 0 9.5 6.5 9.5 6.5a17.9 17.9 0 0 1-3.1 4.1M6.6 6.7C3.7 8.6 2 12 2 12s3.5 6.5 9.5 6.5c1.4 0 2.6-.3 3.7-.8" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.7 9a2.5 2.5 0 1 1 3.7 2.2c-.9.5-1.4 1-1.4 2.1" />
      <path d="M12 17.5h.01" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 7v5h-5" />
      <path d="M18.5 16.5A8 8 0 1 1 20 12" />
    </>
  ),
  check: <path d="m4.5 12.5 4.8 4.8L19.8 6.8" />,
  close: (
    <>
      <path d="M5 5l14 14" />
      <path d="M19 5 5 19" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  minus: <path d="M5 12h14" />,
  clear: (
    <>
      <path d="m4 15 7.7-9.4a2 2 0 0 1 3-.2l4 3.4a2 2 0 0 1 .2 3L12.2 20H8.5Z" />
      <path d="m9 9.3 7 6" />
    </>
  ),
  externalLink: (
    <>
      <path d="M14 4h6v6" />
      <path d="m20 4-9 9" />
      <path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" />
    </>
  ),
  play: <path d="m8 5 11 7-11 7Z" />,
  brush: (
    <>
      <path d="m14.7 5.3 4 4" />
      <path d="M5 19c2.2.3 4-.4 4.8-2.1.4-.8.4-1.6.2-2.4L17.9 6.6a1.8 1.8 0 0 0-2.5-2.5L7.5 12c-.8-.2-1.7-.2-2.4.2C3.4 13 2.7 14.8 3 17Z" />
    </>
  ),
  eraser: (
    <>
      <path d="m4.2 15.4 8.8-10a2 2 0 0 1 2.8-.2l3 2.6a2 2 0 0 1 .2 2.8l-7.6 8.6H7.6Z" />
      <path d="m9.2 10 5.8 5.1" />
      <path d="M12 20h8" />
    </>
  ),
  scan: (
    <>
      <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  swap: (
    <>
      <path d="M7 7h13" />
      <path d="m16 3 4 4-4 4" />
      <path d="M17 17H4" />
      <path d="m8 13-4 4 4 4" />
    </>
  ),
  arrowDownLeft: (
    <>
      <path d="M19 5 5 19" />
      <path d="M5 10v9h9" />
    </>
  ),
  logout: (
    <>
      <path d="M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4" />
      <path d="M14 8l4 4-4 4M18 12H9" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9" r="1.5" />
      <path d="m4 17 4.5-4.5 3.5 3 2.5-2.5 5.5 5" />
    </>
  ),
  images: (
    <>
      <rect x="6" y="6" width="15" height="14" rx="2" />
      <path d="M3 16V6a2 2 0 0 1 2-2h11" />
      <circle cx="11" cy="11" r="1.3" />
      <path d="m7 18 4-4 2.8 2.5 2.2-2 4 3.5" />
    </>
  ),
  history: (
    <>
      <path d="M4 7v5h5" />
      <path d="M5.5 17.5A8.5 8.5 0 1 0 4 12" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  toolbox: (
    <>
      <rect x="3" y="8" width="18" height="11" rx="2" />
      <path d="M9 8V5h6v3M3 12h18M10 12v2h4v-2" />
    </>
  ),
  fileSearch: (
    <>
      <path d="M6 3h8l4 4v5" />
      <path d="M14 3v5h5" />
      <path d="M6 3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6" />
      <circle cx="16" cy="16" r="3" />
      <path d="m18.2 18.2 2.3 2.3" />
    </>
  ),
  wand: (
    <>
      <path d="m5 19 10.5-10.5 3 3L8 22Z" />
      <path d="m6 3 .8 2.2L9 6l-2.2.8L6 9l-.8-2.2L3 6l2.2-.8ZM16 2l.6 1.4L18 4l-1.4.6L16 6l-.6-1.4L14 4l1.4-.6ZM20 16l.6 1.4L22 18l-1.4.6L20 20l-.6-1.4L18 18l1.4-.6Z" />
    </>
  ),
  maximize: <rect x="5" y="5" width="14" height="14" rx="1" />,
  minimize: <path d="M5 12h14" />,
  chevronDown: <path d="m6.5 9 5.5 5.5L17.5 9" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m16.2 16.2 4.3 4.3" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10.5v6" />
      <path d="M12 7.2h.01" />
    </>
  ),
  successCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m7.8 12.2 2.8 2.8 5.8-6" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  loader: (
    <>
      <path d="M21 12a9 9 0 0 1-9 9" />
      <path d="M12 3a9 9 0 0 1 6.4 2.6" />
      <path d="M3 12a9 9 0 0 1 3.1-6.8" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 6h16M4 12h16M4 18h16" />
      <circle cx="9" cy="6" r="2" />
      <circle cx="15" cy="12" r="2" />
      <circle cx="8" cy="18" r="2" />
    </>
  ),
  chevronRight: <path d="m9 6 6 6-6 6" />,
};

const LEGACY_ICON_MAP: Record<string, IconName> = {
  "⚙": "settings",
  "❔": "help",
  "?": "help",
  "↺": "refresh",
  "↻": "refresh",
  "⟲": "refresh",
  "✓": "check",
  "✕": "close",
  "×": "close",
  "+": "plus",
  "＋": "plus",
  "−": "minus",
  "⌧": "clear",
  "↗": "externalLink",
  "→": "externalLink",
  "▶": "play",
  "✎": "brush",
  "⌫": "eraser",
  "◎": "scan",
  "⇄": "swap",
  "↔": "swap",
  "↙": "arrowDownLeft",
  "⇥": "logout",
  "⧉": "copy",
  "✦": "sparkles",
  "☆": "star",
  "◌": "brush",
  "◈": "wand",
  "▣": "toolbox",
  "▧": "images",
  "▤": "history",
  "◇": "image",
  "◒": "palette",
  "♙": "user",
  "…": "loader",
};

export function iconNameForLegacyGlyph(glyph: string): IconName | undefined {
  return LEGACY_ICON_MAP[glyph];
}

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      className={clsx("ui-icon", name === "loader" && "ui-icon-spin", className)}
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
