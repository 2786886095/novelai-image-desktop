import { dialog, type BrowserWindow } from "electron";
import { readStore, ensureHistoryGroup, applyMcpHistoryMoves } from "./store";
import { extractEmbeddedImageMetadata } from "../image-metadata";
import { exactLocalCharacterTags } from "./resource-databases";
import { createGalleryMcpTools, type GalleryMcpTool } from "./mcp-history-gallery";

export function galleryMcpForWindow(window: () => BrowserWindow | null | undefined): GalleryMcpTool[] {
  return createGalleryMcpTools({
    images: () => readStore().history,
    groups: () => readStore().historyGroups,
    create: ensureHistoryGroup,
    move: applyMcpHistoryMoves,
    decode: extractEmbeddedImageMetadata,
    characters: exactLocalCharacterTags,
    approve: async (moves, signal) => {
      const groups = new Map(readStore().historyGroups.map(group => [group.id, group.name]));
      const destinations = new Map<string, number>();
      for (const move of moves) {
        const name = (move.to && groups.get(move.to)) || "未分组 / Ungrouped";
        destinations.set(name, (destinations.get(name) ?? 0) + 1);
      }
      const summary = [...destinations].map(([name, count]) => name + " — " + count).join("\n");
      const optionsMessage = {
        type: "question" as const, title: "MCP · 图库分类 / Gallery classification",
        message: "将更新 " + moves.length + " 张图片将移入对应日期下的分组文件夹；不会覆盖同名文件。",
        detail: "Apply the reviewed classification? Files will move under their original date; existing files will not be overwritten.\n\n" + summary,
        buttons: ["取消 / Cancel", "应用分类 / Apply"], defaultId: 0, cancelId: 0, noLink: true, signal,
      };
      const win = window();
      const result = win && !win.isDestroyed() && win.isVisible()
        ? await dialog.showMessageBox(win, optionsMessage) : await dialog.showMessageBox(optionsMessage);
      return result.response === 1;
    },
    refresh: () => {
      try {
        const win = window();
        if (win && !win.isDestroyed()) win.webContents.send("mcp:event", { kind: "history-groups", count: 0 });
      } catch { /* a renderer closed after the history commit */ }
    },
  });
}
