import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("electron", () => ({ protocol: {} }));
import {
  ComfyJobRunner, collectHistoryOutputs, mapPromptError, saveComfyOutputs, sniffImageType,
} from "./comfyui-jobs";
import type { ComfyCompiledPrompt, ComfyJobRunnerOptions, ComfyJobSocket, ComfyJobSnapshot } from "./comfyui-jobs";
import { comfyGetJson, comfyPostJson, resolveLoopbackTarget } from "./comfyui-http";
import { listResultRecords, readRunReceipt } from "./comfyui-config";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6PpAAAAAASUVORK5CYII=", "base64");
const base = process.env.COMFY_TEST_EVIDENCE_ROOT ?? path.join(os.tmpdir(), "comfy-jobs-tests");
const fixturePath = path.resolve(__dirname, "../../tests/fixtures/comfyui-protocol/main.py");
const children: { process: ChildProcess; dir: string; flushed: Promise<void> }[] = [];
const target = resolveLoopbackTarget("http://127.0.0.1:8188");
const prompt: ComfyCompiledPrompt = { "1": { class_type: "FixtureOutput", inputs: { text: "fixture only" } } };
const workflow = { id: "test-workflow", name: "TEST FIXTURE", createdAt: "2026-10-20T00:00:00Z", updatedAt: "2026-10-20T00:00:00Z", sourcePayload: prompt, slots: [{ id: "text", nodeId: "1", input: "text" }] };
async function temp() { await fs.mkdir(base, { recursive: true }); return fs.mkdtemp(path.join(base, "jobs-")); }
async function until(predicate: () => boolean | Promise<boolean>, timeout = 5000) {
  const end = Date.now() + timeout;
  while (!await predicate()) { if (Date.now() > end) throw new Error("TEST condition timed out"); await new Promise((resolve) => setTimeout(resolve, 10)); }
}
function history(id: string, status = "success", images: unknown[] = [{ filename: "test.png", subfolder: "", type: "output" }]) {
  return { [id]: { outputs: { "1": { images } }, status: { status_str: status, completed: status === "success", messages: status === "error" ? [["execution_error", { prompt_id: id, exception_message: "fixture failure" }]] : [] } } };
}
function request(slotValues: Record<string, string | number | boolean> = {}) {
  return { workflowId: workflow.id, analysisRevision: "test-revision", slotValues, seedMode: "fixed" as const, confirmations: { thirdPartyFingerprint: null, unverifiedConversion: false } };
}
function options(userData: string, patch: Partial<ComfyJobRunnerOptions> = {}): ComfyJobRunnerOptions {
  return {
    userData, outputDirectory: path.join(userData, "out"), getTarget: () => target,
    loadWorkflow: async () => workflow,
    compileWorkflow: async (_, input) => ({ prompt: { "1": { ...prompt["1"], inputs: { text: String(input.slotValues.text ?? "fixture only") } } }, slotValues: input.slotValues, receipt: { slots: workflow.slots, resolvedValues: input.slotValues } }),
    mediaUrl: (file, revision) => `fixture-media:${revision}:${file}`,
    pollIntervalMs: 10, maxDurationMs: 3000,
    ...patch,
  };
}
async function socketScenario(messages: unknown[], beforeAdmission: unknown[] = [], finalStatus = "success") {
  const userData=await temp(),states:ComfyJobSnapshot[]=[];
  class Socket extends EventTarget implements ComfyJobSocket {readyState=1;close(){this.readyState=3;}}
  const socket=new Socket(),send=(message:unknown)=>socket.dispatchEvent(new MessageEvent("message",{data:JSON.stringify(message)}));
  const graph:ComfyCompiledPrompt={"1":{class_type:"FixtureStage",inputs:{}},"2":{class_type:"FixtureStage",inputs:{}},"3":{class_type:"FixtureOutput",inputs:{}}};
  const postJson=vi.fn(async()=>{for(const event of beforeAdmission)send(event);return {prompt_id:"pid",number:0};});
  let sent=false;
  const runner=new ComfyJobRunner(options(userData,{compileWorkflow:async(_,input)=>({prompt:graph,slotValues:input.slotValues}),transport:{
    openSocket:async()=>socket,postJson,getBytes:async()=>PNG,
    getJson:async(_,route)=>{if(route.startsWith("/history/")){if(!sent){sent=true;for(const event of messages)send(event);}return history("pid",finalStatus);}return {queue_running:[],queue_pending:[]};},
  }}));
  runner.on(state=>states.push(state));const result=await runner.run(request());
  expect(postJson).toHaveBeenCalledTimes(1);return {result,states};
}
async function fixture(mode = "ok", delay = 0.1) {
  const dir = await temp(), ledger = path.join(dir, "ledger.jsonl");
  const argv = ["-B", fixturePath, "--disable-auto-launch", "--listen", "127.0.0.1", "--port", "0", "--fixture-ledger", ledger, "--fixture-mode", mode, "--fixture-generation-delay", String(delay)];
  const child = spawn(process.env.COMFY_TEST_PYTHON ?? (process.platform === "win32" ? "python" : "python3"), argv, { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = ""; child.stdout!.on("data", (data) => { stdout += data.toString(); }); child.stderr!.on("data", (data) => { stderr += data.toString(); });
  await fs.writeFile(path.join(dir, "COMMAND.json"), JSON.stringify({ executable: child.spawnfile, argv, pid: child.pid, kind: "protocol TEST FIXTURE; no inference" }, null, 2));
  child.once("error", (error) => { stderr += `process error: ${error.message}\n`; });
  const flushed = new Promise<void>((resolve, reject) => { child.once("close", (code, signal) => { Promise.all([fs.writeFile(path.join(dir, "stdout.txt"), stdout), fs.writeFile(path.join(dir, "stderr.txt"), stderr), fs.writeFile(path.join(dir, "EXIT.json"), JSON.stringify({ code, signal }))]).then(() => resolve(), reject); }); });
  children.push({ process: child, dir, flushed });
  await until(() => /ready http:\/\/127\.0\.0\.1:(\d+)/.test(stdout) || child.exitCode !== null);
  const match = /ready http:\/\/127\.0\.0\.1:(\d+)/.exec(stdout); if (!match) throw new Error(`Fixture startup failed: ${stderr}`);
  const t = resolveLoopbackTarget(`http://127.0.0.1:${match[1]}`);
  const fixturePrompt = JSON.parse(await fs.readFile(path.join(path.dirname(fixturePath), "api-workflow-anima.json"), "utf8")) as ComfyCompiledPrompt;
  return { dir, ledger, target: t, fixturePrompt, child };
}
afterEach(async () => {
  for (const { process: child, dir, flushed } of children.splice(0)) {
    if (child.exitCode === null) child.kill();
    await until(() => child.exitCode !== null || child.signalCode !== null);
    await flushed;
    await fs.writeFile(path.join(dir, "CLEANUP.json"), JSON.stringify({ pid: child.pid, exitCode: child.exitCode, signal: child.signalCode, alive: false }));
  }
  vi.restoreAllMocks();
});

describe("ComfyUI output and job safety", () => {
  it("checks real raster headers rather than extension, HTML or a truncated PNG prefix", () => {
    expect(sniffImageType(PNG)).toMatchObject({ mime: "image/png", width: 1, height: 1 });
    expect(sniffImageType(Buffer.from("<html>image.png</html>"))).toBeNull();
    expect(sniffImageType(PNG.subarray(0, 33))).toBeNull();
    expect(sniffImageType(Buffer.from("<svg></svg>"))).toBeNull();
    const large = Buffer.from(PNG); large.writeUInt32BE(100000, 16); expect(sniffImageType(large)).toBeNull();
  });

  it("rejects output traversal/input files, deduplicates descriptors and preserves valid partial images", () => {
    const collected = collectHistoryOutputs(history("pid", "success", [
      { filename: "valid.png", type: "output" }, { filename: "valid.png", type: "output" },
      { filename: "../secret.png", type: "output" }, { filename: "%252e%252e%252fsecret.png", type: "output" },
      { filename: "input.png", type: "input" }, { filename: "ok.png", subfolder: "../outside", type: "temp" },
    ]), "pid");
    expect(collected.images).toHaveLength(1); expect(collected.errors).toHaveLength(4);
    expect(collectHistoryOutputs(history("other"), "pid").images).toEqual([]);
  });

  it("writes verified image bytes only below ComfyUI/date and preserves good partial results", async () => {
    const userData = await temp();
    const saved = await saveComfyOutputs({ target, images: [{ nodeId: "1", filename: "real.png", subfolder: "", type: "output" }, { nodeId: "2", filename: "fake.png", subfolder: "", type: "output" }], outputDirectory: userData, runId: "run-1", workflowId: "wf-1", promptId: "pid-1", createdAt: "2026-10-20T00:00:00Z", slotValues: {}, getBytes: async (_, route) => route.includes("real.png") ? PNG : Buffer.from("not image"), mediaUrl: (file) => `fixture:${file}` });
    expect(saved.results).toHaveLength(1); expect(saved.errors).toHaveLength(1);
    expect(saved.results[0].filePath).toContain(path.join("ComfyUI", "2026-10-20"));
    expect(await fs.readFile(saved.results[0].filePath)).toEqual(PNG);
    expect(saved.results[0].sha256).toBe(createHash("sha256").update(PNG).digest("hex"));
  });

  it("refuses output-directory junctions and never writes into their destination", async () => {
    const userData = await temp(), outside = await temp();
    await fs.symlink(outside, path.join(userData, "ComfyUI"), process.platform === "win32" ? "junction" : "dir");
    await expect(saveComfyOutputs({ target, images: [], outputDirectory: userData, runId: "run-1", workflowId: "wf-1", promptId: "pid-1", createdAt: "2026-10-20T00:00:00Z", slotValues: {} })).rejects.toThrow("SYMLINK");
    expect(await fs.readdir(outside)).toEqual([]);
  });

  it("allows renderer id+scalar slots only and does not contact ComfyUI for an injected graph", async () => {
    const userData = await temp(); const compileWorkflow = vi.fn(), postJson = vi.fn();
    const runner = new ComfyJobRunner(options(userData, { compileWorkflow, transport: { postJson } }));
    await expect(runner.run({ ...request(), prompt } as never)).rejects.toThrow("ID_AND_SLOTS_ONLY");
    await expect(runner.run({ ...request(), slotValues: { bad: {} } } as never)).rejects.toThrow("SLOT_VALUE");
    expect(compileWorkflow).not.toHaveBeenCalled(); expect(postJson).not.toHaveBeenCalled();
  });

  it("attempts WS before one POST, polls after disconnect, filters foreign events and stores exact parameters", async () => {
    const userData = await temp(), order: string[] = []; let id = "", clientId = "", polls = 0;
    class Socket extends EventTarget implements ComfyJobSocket { readyState = 1; close() { this.readyState = 3; } }
    const socket = new Socket(); const states: ComfyJobSnapshot[] = [];
    const runner = new ComfyJobRunner(options(userData, { transport: {
      openSocket: async (_, client) => { order.push("ws"); clientId = client; return socket; },
      postJson: async (_, route, body) => { order.push(route); id = (body as { prompt_id: string }).prompt_id; setTimeout(() => { socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "progress", data: { prompt_id: "foreign", value: 99, max: 100 } }) })); socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "progress", data: { prompt_id: id, value: 1, max: 2 } }) })); socket.dispatchEvent(new Event("close")); }, 2); return { prompt_id: id, number: 0 }; },
      getJson: async (_, route) => route.startsWith("/history/") ? (++polls > 1 ? history(id) : {}) : { queue_running: [[0, id, {}, { client_id: clientId }]], queue_pending: [] },
      getBytes: async () => PNG,
    } })); runner.on((state) => states.push(state));
    const done = await runner.run(request({ text: "exact user text", seed: 1234 }));
    expect(order).toEqual(["ws", "/prompt"]); expect(done.phase).toBe("completed");
    expect(states.some((state) => state.progress?.value === 1)).toBe(true); expect(states.some((state) => state.progress?.value === 99)).toBe(false);
    expect(done.warnings.some((warning) => warning.includes("disconnected"))).toBe(true);
    const receipt = await readRunReceipt(userData, done.runId);
    expect(receipt?.request).toEqual(request({ text: "exact user text", seed: 1234 }));
    expect((receipt?.compiledPrompt as ComfyCompiledPrompt)["1"].inputs.text).toBe("exact user text");
    expect((await listResultRecords(userData))[0].promptId).toBe(id);
    expect(runner.active()).toBeNull();
  });

  it("never resubmits an uncertain admission response", async () => {
    const userData = await temp(); const postJson = vi.fn(async () => { throw new Error("connection reset after write"); });
    const runner = new ComfyJobRunner(options(userData, { transport: { openSocket: async () => { throw new Error("no WS"); }, postJson } }));
    const result = await runner.run(request());
    expect(result.error?.code).toBe("submission-uncertain"); expect(postJson).toHaveBeenCalledTimes(1);
    expect((await readRunReceipt(userData, result.runId))?.postAttempts).toBe(1);
  });

  it("does not treat empty queue or missing history as completion", async () => {
    const userData = await temp();
    const runner = new ComfyJobRunner(options(userData, { maxDurationMs: 70, transport: { openSocket: async () => { throw new Error("no WS"); }, postJson: async () => ({ prompt_id: "pid", number: 0 }), getJson: async (_, route) => route === "/queue" ? { queue_running: [], queue_pending: [] } : {} } }));
    const result = await runner.run(request());
    expect(result.phase).toBe("failed"); expect(result.error?.code).toBe("monitoring-timeout"); expect(result.results).toEqual([]);
  });

  it("preserves images returned with an execution error without claiming success", async () => {
    const userData = await temp();
    const runner = new ComfyJobRunner(options(userData, { transport: { openSocket: async () => { throw new Error("no WS"); }, postJson: async () => ({ prompt_id: "pid", number: 0 }), getJson: async () => history("pid", "error"), getBytes: async () => PNG } }));
    const result = await runner.run(request());
    expect(result.phase).toBe("failed"); expect(result.error?.code).toBe("execution-failed"); expect(result.error?.nodeErrors[0]).toMatchObject({ message: "fixture failure" }); expect(result.results).toHaveLength(1);
    expect(await listResultRecords(userData)).toHaveLength(1);
  });

  it("maps rejected prompt node errors without confusing them with generation success", () => {
    expect(mapPromptError({ error: { message: "missing model" }, node_errors: { "1": { errors: ["missing"] } } })).toMatchObject({ code: "prompt-rejected", message: "missing model", detail: { node_errors: { "1": { errors: ["missing"] } } } });
  });

  it("treats a malformed HTTP-success admission as uncertain and never submits again", async () => {
    const userData = await temp(), postJson = vi.fn(async () => ({ status: "ok" }));
    const runner = new ComfyJobRunner(options(userData, { transport: { openSocket: async () => { throw new Error("no WS"); }, postJson } }));
    const result = await runner.run(request());
    expect(result.error?.code).toBe("submission-uncertain"); expect(postJson).toHaveBeenCalledTimes(1);
  });

  it("does not cancel a matching prompt id that belongs to a different client", async () => {
    const userData = await temp(), posts: string[] = [];
    const runner = new ComfyJobRunner(options(userData, { maxDurationMs: 100, transport: {
      openSocket: async () => { throw new Error("no WS"); },
      postJson: async (_, route) => { posts.push(route); return { prompt_id: "same-pid", number: 0 }; },
      getJson: async (_, route) => route === "/queue" ? { queue_running: [[0, "same-pid", {}, { client_id: "foreign-client" }]], queue_pending: [] } : {},
    } }));
    const run = runner.run(request()); await until(() => runner.active()?.promptId === "same-pid");
    expect(await runner.cancel(runner.active()!.runId)).toBe(false);
    const result = await run; expect(result.phase).toBe("failed"); expect(result.error?.code).toBe("monitoring-timeout");
    expect(posts).toEqual(["/prompt"]);
  });

  it("records resolved random seeds and every resolved slot for exact reuse", async () => {
    const userData = await temp(); const input = { ...request({ text: "user text", seed: 0 }), seedMode: "random" as const };
    const compileWorkflow = vi.fn<ComfyJobRunnerOptions["compileWorkflow"]>(async () => ({ prompt, slotValues: { text: "user text", seed: 123456 }, seeds: { seed: 123456 } }));
    const runner = new ComfyJobRunner(options(userData, { compileWorkflow, transport: {
      openSocket: async () => { throw new Error("no WS"); }, postJson: async () => ({ prompt_id: "pid", number: 0 }),
      getJson: async () => history("pid"), getBytes: async () => PNG,
    } }));
    const result = await runner.run(input); expect(result.phase).toBe("completed");
    expect(compileWorkflow.mock.calls[0][1]).toEqual(input);
    expect(result.seeds).toEqual({ seed: 123456 }); expect(result.results[0].slotValues).toEqual({ text: "user text", seed: 123456 });
    const receipt = await readRunReceipt(userData, result.runId);
    expect(receipt?.resolvedSlotValues).toEqual({ text: "user text", seed: 123456 }); expect(receipt?.request).toEqual(input);
  });

  it("counts explicit non-image outputs without claiming they were imported", async () => {
    const userData = await temp();
    const runner = new ComfyJobRunner(options(userData, { transport: {
      openSocket: async () => { throw new Error("no WS"); }, postJson: async () => ({ prompt_id: "pid", number: 0 }),
      getJson: async () => ({ pid: { ...history("pid").pid, outputs: { "1": { videos: [{ filename: "a.mp4" }], text: ["not an image"] } } } }),
    } }));
    const result = await runner.run(request()); expect(result.phase).toBe("failed");
    expect(result.error?.code).toBe("no-image-output"); expect(result.nonImageOutputs).toBe(2); expect(result.results).toEqual([]);
  });

});

describe("explicit progress_state node completion",()=>{
  const state=(nodes:Record<string,unknown>,prompt_id:unknown="pid")=>({type:"progress_state",data:{prompt_id,nodes}});
  it("counts only actual finished known nodes and never fills the graph count on successful history",async()=>{
    const {result,states}=await socketScenario([
      state({"1":{state:"finished"},"2":{state:"finished"},"3":{state:"finished"}},"foreign"),
      state({"1":{state:"pending"},"2":{state:"running"},"3":{state:"error"},unknown:{state:"finished"}}),
      state({"1":{state:"finished",node_id:"1",prompt_id:"pid"}}),
      state({"1":{state:"finished"},"2":{state:"finished"},"3":{state:"running"}}),
      state({"1":{state:"finished"},"2":{state:"finished"}}),
    ]);
    expect(result.phase).toBe("completed");expect(result.nodesExecuted).toBe(2);expect(result.nodesTotal).toBe(3);
    expect(states.some(snapshot=>snapshot.nodesExecuted===1)).toBe(true);expect(states.every(snapshot=>snapshot.nodesExecuted<=2)).toBe(true);
  });
  it("deduplicates modern finished state with legacy executed and cached notifications",async()=>{
    const {result}=await socketScenario([
      {type:"execution_cached",data:{prompt_id:"pid",nodes:["1","1","unknown"]}},
      {type:"executed",data:{prompt_id:"pid",node:"3",output:{images:[]}}},
      state({"1":{state:"finished"},"2":{state:"finished"},"3":{state:"finished"}}),
      state({"1":{state:"finished"},"2":{state:"finished"},"3":{state:"finished"}}),
    ]);
    expect(result.nodesExecuted).toBe(3);expect(result.nodesTotal).toBe(3);
  });
  it("ignores mismatched nested identity, malformed nodes, inherited names and oversized state maps",async()=>{
    const tooMany=Object.fromEntries(Array.from({length:5001},(_,index)=>[index===0?"1":`unknown-${index}`,{state:"finished"}]));
    const {result}=await socketScenario([
      state({"1":{state:"finished",prompt_id:"foreign"},"2":{state:"finished",node_id:"3"},"3":{state:"pending"}}),
      state({toString:{state:"finished"},unknown:{state:"finished"}}),
      {type:"progress_state",data:{prompt_id:"pid",nodes:[]}},state(tooMany),
    ],[state({"1":{state:"finished"}},null)]);
    expect(result.nodesExecuted).toBe(0);expect(result.phase).toBe("completed");
  });
  it("never guesses a previous node finished merely because another node started",async()=>{
    const {result}=await socketScenario([
      {type:"executing",data:{prompt_id:"pid",node:"1"}},
      {type:"executing",data:{prompt_id:"pid",node:"2"}},
      state({"1":{state:"running"},"2":{state:"running"},"3":{state:"pending"}}),
    ]);
    expect(result.nodesExecuted).toBe(0);expect(result.nodesTotal).toBe(3);
  });
});

describe("node-scoped sampling progress",()=>{
  const executing=(node:string|null)=>({type:"executing",data:{prompt_id:"pid",node}});
  const progress=(node:string,value:number,max:number,prompt_id="pid")=>({type:"progress",data:{prompt_id,node,value,max}});
  it("clears old sampling progress on a different executing node and null end, but not duplicate same-node notifications",async()=>{
    const {result,states}=await socketScenario([
      executing("1"),progress("1",5,10),executing("2"),progress("2",2,3),executing("2"),executing(null),
    ]);
    const firstNode2=states.find(snapshot=>snapshot.currentNode?.id==="2")!;
    expect(firstNode2.progress).toBeNull();
    expect(states.some(snapshot=>snapshot.currentNode?.id==="2"&&snapshot.progress?.value===2&&snapshot.progress.max===3)).toBe(true);
    const node2States=states.filter(snapshot=>snapshot.currentNode?.id==="2");
    expect(node2States.at(-1)?.progress).toEqual({value:2,max:3});
    expect(states.some(snapshot=>snapshot.phase==="running"&&snapshot.currentNode===null&&snapshot.progress===null)).toBe(true);
    expect(result.currentNode).toBeNull();expect(result.progress).toBeNull();
  });
  it("accepts explicit progress only for the matching known current node and clears success/error terminal progress",async()=>{
    for(const status of ["success","error"]){
      const {result,states}=await socketScenario([
        progress("1",88,100),executing("1"),progress("1",1,2),progress("2",99,100),
        progress("unknown",66,100),progress("1",77,100,"foreign"),progress("1",2,2),
      ],[],status);
      expect(states.some(snapshot=>snapshot.currentNode?.id==="1"&&snapshot.progress?.value===1)).toBe(true);
      expect(states.some(snapshot=>snapshot.currentNode?.id==="1"&&snapshot.progress?.value===2)).toBe(true);
      expect(states.every(snapshot=>!snapshot.progress||![88,99,66,77].includes(snapshot.progress.value))).toBe(true);
      expect(result.phase).toBe(status==="success"?"completed":"failed");expect(result.progress).toBeNull();
    }
  });
});

describe("real independent Python protocol fixture (not model inference)", () => {
  it("uses actual loopback HTTP, saves image and falls back from unsupported WS", async () => {
    const f = await fixture(); const runner = new ComfyJobRunner(options(f.dir, { getTarget: () => f.target, compileWorkflow: async (_, input) => ({ prompt: f.fixturePrompt, slotValues: input.slotValues }) }));
    const result = await runner.run(request());
    expect(result.phase).toBe("completed"); expect(result.results).toHaveLength(1); expect(result.warnings.join(" ")).toContain("WebSocket unavailable");
    const lines = (await fs.readFile(f.ledger, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    expect(lines.filter((line) => line.event === "prompt_accepted")).toHaveLength(1);
    expect((await readRunReceipt(f.dir, result.runId))?.history).toBeTruthy();
  });

  it("reports HTTP400 node_errors and performs exactly one POST", async () => {
    const f = await fixture("reject"); const runner = new ComfyJobRunner(options(f.dir, { getTarget: () => f.target, compileWorkflow: async (_, input) => ({ prompt: f.fixturePrompt, slotValues: input.slotValues }) }));
    const result = await runner.run(request());
    expect(result.phase).toBe("failed"); expect(result.error?.code).toBe("prompt-rejected"); expect(result.results).toEqual([]);
    expect((await readRunReceipt(f.dir, result.runId))?.postAttempts).toBe(1);
  });

  it("reports actual generation failure and no false image result", async () => {
    const f = await fixture("generation-error"); const runner = new ComfyJobRunner(options(f.dir, { getTarget: () => f.target, compileWorkflow: async (_, input) => ({ prompt: f.fixturePrompt, slotValues: input.slotValues }) }));
    const result = await runner.run(request());
    expect(result.phase).toBe("failed"); expect(result.error?.code).toBe("execution-failed"); expect(result.results).toHaveLength(0);
  });

  it("cancels only its own currently running prompt and waits for interrupted history", async () => {
    const f = await fixture("hang"); const runner = new ComfyJobRunner(options(f.dir, { getTarget: () => f.target, compileWorkflow: async (_, input) => ({ prompt: f.fixturePrompt, slotValues: input.slotValues }) }));
    const run = runner.run(request());
    await until(() => runner.active()?.phase === "running"); const id = runner.active()!.promptId!;
    expect(await runner.cancel(runner.active()!.runId)).toBe(true);
    const result = await run; expect(result.phase).toBe("cancelled");
    const h = await comfyGetJson<Record<string, { status: unknown }>>(f.target, `/history/${id}`); expect(h[id].status).toMatchObject({ status_str: "error" });
  });

  it("deletes its pending prompt while leaving a foreign running prompt untouched", async () => {
    const f = await fixture("hang");
    const foreign = await comfyPostJson<{ prompt_id: string }>(f.target, "/prompt", { prompt: f.fixturePrompt, client_id: "foreign-client" });
    await until(async () => (await comfyGetJson<{ queue_running: unknown[][] }>(f.target, "/queue")).queue_running.some((item) => item[1] === foreign.prompt_id));
    const runner = new ComfyJobRunner(options(f.dir, { getTarget: () => f.target, compileWorkflow: async (_, input) => ({ prompt: f.fixturePrompt, slotValues: input.slotValues }) }));
    const run = runner.run(request()); await until(() => !!runner.active()?.promptId);
    expect(await runner.cancel(runner.active()!.runId)).toBe(true);
    expect((await run).phase).toBe("cancelled");
    const q = await comfyGetJson<{ queue_running: unknown[][]; queue_pending: unknown[][] }>(f.target, "/queue");
    expect(q.queue_running[0][1]).toBe(foreign.prompt_id); expect(q.queue_pending).toEqual([]);
    const ledger = await fs.readFile(f.ledger, "utf8"); expect(ledger).not.toContain('"path": "/interrupt"'); expect(ledger).not.toContain('"clear": true');
  });
});
