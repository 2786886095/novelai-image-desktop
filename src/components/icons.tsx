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
  | "dice"
  | "pin"
  | "key"
  | "mapPin"
  | "trash"
  | "upgrade"
  | "download"
  | "warning";

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
  warning: (
    <>
      <path d="M12 3.5 21 19.5H3Z" />
      <path d="M12 10v4.2" />
      <path d="M12 17.4h.01" />
    </>
  ),
};

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      className={clsx("ui-icon", className)}
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
