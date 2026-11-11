import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { crc32 } from "node:zlib";
import { PNG } from "pngjs";
import { afterAll, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ dir: "", approve: false }));
vi.mock("electron", () => ({
  app: { isPackaged: false, getPath: () => fixture.dir, getAppPath: () => fixture.dir },
  safeStorage: { isEncryptionAvailable: () => true, encryptString: (s: string) => Buffer.from(s), decryptString: (b: Buffer) => b.toString() },
  dialog: { showMessageBox: async () => ({ response: fixture.approve ? 1 : 0 }) },
}));
vi.mock("./agent-tools", () => ({ executeAgentTool: vi.fn(), agentGenerationInput: vi.fn(), agentInpaintInput: vi.fn() }));
vi.mock("./nai", () => ({ quoteAnlasCost: vi.fn(), refreshStoredAccount: vi.fn() }));

function makePng(prompt?: string) {
  const png = new PNG({ width: 2, height: 2 });
  png.data.fill(255);
  const image = PNG.sync.write(png);
  if (!prompt) return image;
  const payload = Buffer.from("Description\0" + prompt);
  const chunk = Buffer.alloc(12 + payload.length);
  chunk.writeUInt32BE(payload.length);
  chunk.write("tEXt", 4);
  payload.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, -4)), chunk.length - 4);
  return Buffer.concat([image.subarray(0, -12), chunk, image.subarray(-12)]);
}
afterAll(() => {
  const temp = path.resolve(os.tmpdir());
  if (path.dirname(path.resolve(fixture.dir)) === temp && path.basename(fixture.dir).startsWith("studio-mcp-history-"))
    fs.rmSync(fixture.dir, { recursive: true, force: true });
});

it("creates and moves groups, previews exact metadata rules, and finds character-separated iterations over MCP", async () => {
  fixture.dir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-mcp-history-"));
  const { startMcpServer } = await import("./mcp-server");
  const db = await import("./store");
  const { DEFAULT_PARAMS } = await import("../../src/types");
  const seed = db.readStore();
  const testCases: [string, string?, number?][] = [
    ["anchor", "1girl, elysia_(honkai_impact), {{ocean}}, 1.5::moonlight::, blue eyes", 3],
    ["same", "1girl, elysia_(honkai_impact), ocean, moonlight, blue eyes, night", 1],
    ["different", "2girls, character: other, ocean, moonlight, blue eyes, bokeh", 2],
    ["exact-half", "elysia_(honkai_impact), ocean, moonlight, clouds", 5],
    ["below-half", "elysia_(honkai_impact), ocean, green hill, sun", 6],
    ["no-metadata", undefined, 7],
  ];
  const originals = new Map<string, Buffer>();
  db.writeStore({ ...seed, history: testCases.map(([id, prompt, date]) => {
    const filePath = path.join(fixture.dir, id + ".png");
    const bytes = makePng(prompt);
    fs.writeFileSync(filePath, bytes);
    originals.set(filePath, bytes);
    return { id, filePath, fileUrl: "", date: "2026-01-01", createdAt: "2026-01-01T00:0" + date + ":00Z", actualSeed: 1,
      params: { ...DEFAULT_PARAMS, positivePrompt: "misleading-history-tag" }, model: "test", width: 2, height: 2 };
  }) });
  const notices: unknown[] = [];
  const token = "fixture-only-local-auth";
  const handle = await startMcpServer({ port: 0, token, window: () => ({
    isDestroyed: () => false, isVisible: () => true, webContents: { send: (...a: unknown[]) => notices.push(a) },
  } as unknown as import("electron").BrowserWindow) });
  async function rpc(method: string, params: unknown) {
    const response = await fetch("http://127.0.0.1:" + handle.port + "/mcp", {
      method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    expect(response.status).toBe(200);
    return response.json();
  }
  const call = async (name: string, args: Record<string, unknown>) => rpc("tools/call", { name, arguments: args });
  const data = async (name: string, args: Record<string, unknown>) => {
    const reply = await call(name, args);
    expect(reply.result?.isError, reply.result?.content[0]?.text || reply.error?.message).toBeUndefined();
    return JSON.parse(reply.result.content[0].text);
  };
  try {
    const required = ["create_history_group", "move_history_images", "preview_history_tag_classification", "apply_history_tag_classification", "trace_history_iterations"];
    const list = (await rpc("tools/list", {})).result.tools.map((tool: { name: string }) => tool.name);
    const available = required.filter(name => list.includes(name));
    console.log("MCP_TOOL_COUNT=" + available.length + "/5");
    expect(available).toEqual(required);
    const ocean = (await data("create_history_group", { name: "Ocean" })).group;
    expect(await data("create_history_group", { name: " ocean " })).toMatchObject({ created: false, group: { id: ocean.id } });
    const other = (await data("create_history_group", { name: "Other" })).group;
    const ids = ["same", "missing-id"];
    expect((await call("move_history_images", { attachmentIds: ids, groupId: other.id })).result.isError).toBe(true);
    expect(db.readStore().history.every(row => !row.groupId)).toBe(true);
    expect(await data("move_history_images", { attachmentIds: ["same"], groupId: other.id })).toMatchObject({ moved: 1 });
    const rules = [{ allTags: ["ocean", "moonlight"], targetGroupId: ocean.id }, { allTags: ["bokeh"], targetGroupId: other.id }];
    const preview = await data("preview_history_tag_classification", { rules });
    expect(preview.proposed).toBe(3);
    expect(preview.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ attachmentId: "different", status: "ambiguous" }),
      expect.objectContaining({ attachmentId: "no-metadata", status: "missing_metadata" }),
    ]));
    expect(db.readStore().history.find(row => row.id === "anchor")?.groupId).toBeUndefined();
    expect((await call("apply_history_tag_classification", { planId: preview.planId, confirmed: false })).error.code).toBe(-32602);
    expect((await call("apply_history_tag_classification", { planId: preview.planId, confirmed: true })).result.isError).toBe(true);
    expect(db.readStore().history.find(row => row.id === "anchor")?.groupId).toBeUndefined();
    const historyTag = await data("preview_history_tag_classification", { rules: [{ allTags: ["misleading-history-tag"], targetGroupId: ocean.id }] });
    expect(historyTag.proposed).toBe(0);
    const stale = await data("preview_history_tag_classification", { rules });
    fixture.approve = true;
    const anchorFile = db.readStore().history.find(row => row.id === "anchor")!.filePath;
    fs.writeFileSync(anchorFile, makePng("ocean, moonlight, tree"));
    expect((await call("apply_history_tag_classification", { planId: stale.planId, confirmed: true })).result.isError).toBe(true);
    expect(db.readStore().history.find(row => row.id === "anchor")?.groupId).toBeUndefined();
    fs.writeFileSync(anchorFile, originals.get(anchorFile)!);
    const good = await data("preview_history_tag_classification", { rules });
    expect(await data("apply_history_tag_classification", { planId: good.planId, confirmed: true })).toMatchObject({ moved: 3 });
    expect((await call("apply_history_tag_classification", { planId: good.planId, confirmed: true })).result.isError).toBe(true);
    expect(db.readStore().history.find(row => row.id === "same")?.groupId).toBe(ocean.id);
    expect(db.readStore().history.find(row => row.id === "different")?.groupId).toBeUndefined();
    expect(notices).toHaveLength(4);
    for (const [file, original] of originals) expect(fs.readFileSync(file)).toEqual(original);
    console.log("CLASSIFICATION=preview_no_write, cancel_no_write, stale_no_write, atomic_3, original_bytes_unchanged");
    const trace = await data("trace_history_iterations", { attachmentId: "anchor" });
    expect(trace).toMatchObject({ inference: true, minimumSimilarity: 0.5 });
    expect(trace.lines.map((line: { relation: string; images: { attachmentId: string }[] }) =>
      [line.relation, line.images.map(item => item.attachmentId)])).toEqual([
        ["anchor_characters", ["same", "anchor", "exact-half"]],
        ["related_character_changed", ["different"]],
      ]);
    expect(trace.lines[0].images.at(-1).similarity).toBe(0.5);
    expect(trace.skipped).toEqual([{ attachmentId: "no-metadata", status: "missing_metadata" }]);
    console.log("ITERATIONS=same>anchor>exact-half; related_changed=different; missing_metadata=skipped");
  } finally { await handle.close(); }
}, 25_000);
