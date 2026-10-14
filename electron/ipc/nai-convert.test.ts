import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings, ComicConvertRequest } from "../../src/types";

const axiosMock = vi.hoisted(() => ({
  post: vi.fn(),
  get: vi.fn(),
  isCancel: vi.fn(() => false),
}));

const settingsRef = vi.hoisted(() => ({
  current: {
    convertApiUrl: "",
    convertApiKey: "",
    convertApiModel: "gpt-4o-mini",
    convertSystemPrompt: "",
    convertPromptTemplates: { tags: "", natural: "", mixed: "" },
    mcpForConvert: false,
    proxyUrl: "",
    proxyForAi: true,
  } as Partial<AppSettings>,
}));

vi.mock("axios", () => ({ default: axiosMock }));

vi.mock("./store", () => ({
  addHistory: vi.fn(),
  ensureHistoryGroup: vi.fn(),
  getAccountSummary: vi.fn(() => ({ hasToken: false })),
  getHistoryGroups: vi.fn(() => []),
  getSettings: vi.fn(() => settingsRef.current),
  getToken: vi.fn(() => ""),
  setAccountSummary: vi.fn(),
  setToken: vi.fn(),
  updateHistoryItem: vi.fn(),
}));

function baseRequest(overrides: Partial<ComicConvertRequest> = {}): ComicConvertRequest {
  return {
    mode: "tags",
    globalPrompt: "moonlit fantasy story",
    globalCharacterSetting: "white hair heroine, blue dress, red eyes",
    continuityBible: "",
    globalStylePrompt: "cinematic lighting, very aesthetic",
    referencePrompts: ["white hair, blue dress, calm smile"],
    adultBranch: false,
    panels: [
      {
        panelId: "a",
        index: 1,
        cnPrompt: "女主站在月光下的走廊里，白发红眼，蓝色礼服。",
        previousCnPrompt: "",
        nextCnPrompt: "她推开门。",
        previousPrompts: [],
        previousSummaries: [],
        nextSummaries: ["door opens"],
      },
      {
        panelId: "b",
        index: 2,
        cnPrompt: "她推开门，露出微笑。",
        previousCnPrompt: "女主站在月光下的走廊里。",
        nextCnPrompt: "",
        previousPrompts: ["1girl, white hair"],
        previousSummaries: ["corridor"],
        nextSummaries: [],
      },
    ],
    ...overrides,
  };
}

describe("convertComicPanels fallback path", () => {
  beforeEach(() => {
    axiosMock.post.mockReset();
    axiosMock.get.mockReset();
    settingsRef.current = {
      convertApiUrl: "",
      convertApiKey: "",
      convertApiModel: "gpt-4o-mini",
      convertSystemPrompt: "",
      // These fixtures exercise transport/logging, not the bounded default.
      convertPromptTemplates: { tags: "FIXTURE CUSTOM TAGS NO UNIT BOUND", natural: "", mixed: "" },
      mcpForConvert: false,
      proxyUrl: "",
      proxyForAi: true,
    };
  });

  it("uses the local NovelAI tag template when no convert API is configured", async () => {
    const { convertComicPanels } = await import("./nai");

    const result = await convertComicPanels(baseRequest());

    expect(result.ok).toBe(true);
    expect(axiosMock.post).not.toHaveBeenCalled();
    expect(result.panels).toHaveLength(2);
    expect(result.panels.every((panel) => panel.enPrompt.includes("masterpiece"))).toBe(true);
    expect(result.panels.every((panel) => !panel.error)).toBe(true);
  });

  it("keeps every panel converted with local fallback when the convert API throws", async () => {
    settingsRef.current.convertApiUrl = "https://example.test/v1";
    settingsRef.current.convertApiKey = "sk-test";
    axiosMock.post.mockRejectedValue(new Error("rate limited"));
    const { convertComicPanels } = await import("./nai");

    const result = await convertComicPanels(baseRequest());

    expect(result.ok).toBe(true);
    expect(axiosMock.post).toHaveBeenCalledTimes(2);
    expect(result.panels.map((panel) => panel.panelId)).toEqual(["a", "b"]);
    expect(result.panels.every((panel) => panel.enPrompt.includes("masterpiece"))).toBe(true);
    expect(result.panels.every((panel) => !panel.error)).toBe(true);
  });

  it("replaces model refusals with local fallback instead of returning the refusal text", async () => {
    settingsRef.current.convertApiUrl = "https://example.test/v1";
    settingsRef.current.convertApiKey = "sk-test";
    axiosMock.post.mockResolvedValue({
      data: {
        choices: [{ message: { content: "Sorry, I can't help with that request." }, finish_reason: "stop" }],
      },
    });
    const { convertComicPanels } = await import("./nai");

    const result = await convertComicPanels(baseRequest({ mode: "natural", panels: [baseRequest().panels[0]] }));

    expect(result.ok).toBe(true);
    expect(axiosMock.post).toHaveBeenCalledTimes(1);
    expect(result.panels).toHaveLength(1);
    expect(result.panels[0].enPrompt).toContain("Anime illustration");
    expect(result.panels[0].enPrompt).not.toContain("Sorry");
  });

  it("keeps conversion interactive by avoiding a serial rule-repair request", async () => {
    settingsRef.current.convertApiUrl = "https://example.test/v1";
    settingsRef.current.convertApiKey = "sk-test";
    axiosMock.post
      .mockResolvedValueOnce({
        data: {
          choices: [
            {
              message: { content: "1girl, dogeza, dogeza, bowing" },
              finish_reason: "stop",
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          choices: [
            {
              message: { content: "1girl, dogeza" },
              finish_reason: "stop",
            },
          ],
        },
      });
    const { clearAiCallLog, convertPromptText, getAiCallLog } = await import(
      "./nai"
    );
    clearAiCallLog();

    const result = await convertPromptText("一个女孩土下座", "tags", false);

    expect(result.ok).toBe(true);
    expect(result.result).toBe("1girl, dogeza, dogeza, bowing");
    expect(axiosMock.post).toHaveBeenCalledTimes(1);
    const logs = getAiCallLog();
    expect(logs).toHaveLength(1);
    expect(logs[0].label).not.toContain("规则校验");
  });

  it("disables default thinking for official DeepSeek V4 conversion and reverse requests", async () => {
    settingsRef.current = {
      ...settingsRef.current,
      convertApiUrl: "https://api.deepseek.com",
      convertApiKey: "sk-test",
      convertApiModel: "deepseek-v4-flash-vision-exp",
      visionApiUrl: "https://api.deepseek.com",
      visionApiKey: "sk-test",
      visionApiModel: "deepseek-v4-flash-vision-exp",
      reversePromptTemplates: { tags: "FIXTURE CUSTOM TAGS NO UNIT BOUND", natural: "", mixed: "" },
      mcpForReverse: false,
    };
    axiosMock.post
      .mockResolvedValueOnce({
        data: {
          choices: [{ message: { content: "1girl, blue hair" }, finish_reason: "stop" }],
        },
      })
      .mockResolvedValueOnce({
        data: {
          choices: [{ message: { content: "1girl, solo" }, finish_reason: "stop" }],
        },
      });
    const { convertPromptText, reversePromptImage } = await import("./nai");

    expect((await convertPromptText("蓝发少女", "tags", false)).ok).toBe(true);
    expect(
      (await reversePromptImage(Buffer.from("fake-image").toString("base64"))).ok,
    ).toBe(true);

    for (const call of axiosMock.post.mock.calls) {
      expect(call[1]).toMatchObject({ thinking: { type: "disabled" } });
    }
  });

  it("does not add DeepSeek-specific thinking controls to compatible third-party endpoints", async () => {
    settingsRef.current.convertApiUrl = "https://example.test/v1";
    settingsRef.current.convertApiKey = "sk-test";
    settingsRef.current.convertApiModel = "deepseek-v4-flash-vision-exp";
    axiosMock.post.mockResolvedValue({
      data: {
        choices: [{ message: { content: "1girl, solo" }, finish_reason: "stop" }],
      },
    });
    const { convertPromptText } = await import("./nai");

    expect((await convertPromptText("一个女孩", "tags", false)).ok).toBe(true);
    expect(axiosMock.post.mock.calls[0]?.[1]).not.toHaveProperty("thinking");
  });
});

describe("prompt codex enhancement", () => {
  beforeEach(() => {
    axiosMock.post.mockReset();
    axiosMock.get.mockReset();
    settingsRef.current = {
      visionApiUrl: "https://example.test/v1",
      visionApiKey: "sk-vision",
      visionApiModel: "vision-test",
      visionSystemPrompt: "",
      reversePromptTemplates: { tags: "FIXTURE CUSTOM TAGS NO UNIT BOUND", natural: "", mixed: "" },
      convertApiUrl: "https://example.test/v1",
      convertApiKey: "sk-convert",
      convertApiModel: "text-test",
      convertSystemPrompt: "",
      convertPromptTemplates: { tags: "FIXTURE CUSTOM TAGS NO UNIT BOUND", natural: "", mixed: "" },
      mcpForReverse: false,
      mcpForConvert: false,
      proxyUrl: "",
      proxyForAi: true,
    };
  });

  it("selects independent V4.5 and V5 conversion templates", async () => {
    settingsRef.current.convertPromptTemplatesV45 = {
      tags: "V45 CONVERSION TEMPLATE {{input}}",
      natural: "",
      mixed: "",
    };
    settingsRef.current.convertPromptTemplates = {
      tags: "V5 CONVERSION TEMPLATE {{input}}",
      natural: "",
      mixed: "",
    };
    axiosMock.post.mockResolvedValue({
      data: {
        choices: [{ message: { content: "1girl, solo" }, finish_reason: "stop" }],
      },
    });
    const { convertPromptText } = await import("./nai");

    await convertPromptText("一个女孩", "tags", false, "v4.5");
    await convertPromptText("一个女孩", "tags", false, "v5");

    const first = axiosMock.post.mock.calls[0]?.[1] as {
      messages?: Array<{ role: string; content: string }>;
    };
    const second = axiosMock.post.mock.calls[1]?.[1] as {
      messages?: Array<{ role: string; content: string }>;
    };
    expect(first.messages?.[0]?.content).toContain("V45 CONVERSION TEMPLATE");
    expect(first.messages?.[0]?.content).not.toContain("V5 CONVERSION TEMPLATE");
    expect(first.messages?.[1]?.content).toContain("NovelAI V4.5");
    expect(second.messages?.[0]?.content).toContain("V5 CONVERSION TEMPLATE");
    expect(second.messages?.[1]?.content).toContain("NovelAI V5");
  });

  it("does not synchronously load the large local codex during conversion", async () => {
    axiosMock.post.mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              content:
                "2boys, classroom, book | boy, black hair, source#offer | boy, blue hair, target#offer",
            },
            finish_reason: "stop",
          },
        ],
      },
    });
    const { convertPromptText } = await import("./nai");

    const result = await convertPromptText(
      "一个黑发男孩把书递给蓝发男孩",
      "tags",
      false,
    );

    expect(result.ok).toBe(true);
    const request = axiosMock.post.mock.calls[0]?.[1] as {
      messages?: Array<{ role: string; content: string }>;
    };
    expect(request.messages?.[0]?.content).not.toContain("本地 NovelAI 提示词法典");
  });

  it("applies known-character codex rules to both conversion variants", async () => {
    axiosMock.post.mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                namePrompt:
                  "1girl, solo, furina_(genshin_impact), cafe, drinking tea",
                featurePrompt:
                  "1girl, solo, white hair, blue eyes, blue formal outfit, cafe, drinking tea",
              }),
            },
            finish_reason: "stop",
          },
        ],
      },
    });
    const { convertPromptText } = await import("./nai");

    const result = await convertPromptText(
      "芙宁娜在咖啡馆喝茶",
      "tags",
      true,
    );

    expect(result.ok).toBe(true);
    expect(result.variants?.namePrompt).toContain("furina_(genshin_impact)");
    expect(result.variants?.featurePrompt).not.toContain("furina");
    const request = axiosMock.post.mock.calls[0]?.[1] as {
      messages?: Array<{ role: string; content: string }>;
    };
    expect(request.messages?.[0]?.content).toContain(
      "featurePrompt：删除全部角色名、作品名和版权 Tag",
    );
    expect(request.messages?.[0]?.content).toContain(
      "两个字段必须描述同一完整画面",
    );
    expect(request.messages?.[0]?.content).not.toContain("{{input}}");
  });

  it("recovers a missing known-character variant locally without a second network round trip", async () => {
    axiosMock.post
      .mockResolvedValueOnce({
        data: {
          choices: [
            {
              message: {
                content:
                  "1girl, solo, furina_(genshin_impact), cafe, drinking tea",
              },
              finish_reason: "stop",
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  namePrompt:
                    "1girl, solo, furina_(genshin_impact), cafe, drinking tea",
                  featurePrompt:
                    "1girl, solo, white hair, blue eyes, blue formal outfit, cafe, drinking tea",
                }),
              },
              finish_reason: "stop",
            },
          ],
        },
      });
    const { convertPromptText } = await import("./nai");

    const result = await convertPromptText(
      "芙宁娜在咖啡馆喝茶",
      "tags",
      true,
    );

    expect(result.ok).toBe(true);
    expect(axiosMock.post).toHaveBeenCalledTimes(1);
    expect(result.variants?.namePrompt).toContain("furina_(genshin_impact)");
    expect(result.variants?.featurePrompt).toBeTruthy();
    expect(result.variants?.featurePrompt).not.toContain("furina_(genshin_impact)");
  });

  it("keeps a complete known-character pair without a serial rule-repair call", async () => {
    axiosMock.post
      .mockResolvedValueOnce({
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  namePrompt:
                    "1girl, furina_(genshin_impact), cafe, cafe, drinking tea",
                  featurePrompt:
                    "1girl, white hair, blue eyes, blue formal outfit, cafe, cafe, drinking tea",
                }),
              },
              finish_reason: "stop",
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  namePrompt:
                    "1girl, furina_(genshin_impact), cafe, drinking tea",
                }),
              },
              finish_reason: "stop",
            },
          ],
        },
      });
    const { convertPromptText } = await import("./nai");

    const result = await convertPromptText(
      "芙宁娜在咖啡馆喝茶",
      "tags",
      true,
    );

    expect(result.ok).toBe(true);
    expect(result.variants?.namePrompt).toContain("furina_(genshin_impact)");
    expect(result.variants?.featurePrompt).toContain("white hair");
    expect(axiosMock.post).toHaveBeenCalledTimes(1);
  });

  it("uses one vision request for reverse and records the reconstruction prompt", async () => {
    axiosMock.post
      .mockResolvedValueOnce({
        data: {
          choices: [
            {
              message: {
                content:
                  "2girls, outdoors | girl, blonde hair, hugging | girl, purple hair, hugging",
              },
              finish_reason: "stop",
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          choices: [
            {
              message: {
                content:
                  "2girls, outdoors | girl, blonde hair, source#hug | girl, purple hair, target#hug",
              },
              finish_reason: "stop",
            },
          ],
        },
      });
    const { clearAiCallLog, getAiCallLog, reversePromptImage } = await import(
      "./nai"
    );
    clearAiCallLog();

    const result = await reversePromptImage(
      Buffer.from("fake-image").toString("base64"),
      "tags",
      "full",
      "两个女孩拥抱",
      false,
    );

    expect(result.ok).toBe(true);
    expect(axiosMock.post).toHaveBeenCalledTimes(1);
    expect(result.prompt).toContain("hugging");
    const logs = getAiCallLog();
    expect(logs).toHaveLength(1);
    expect(logs[0].label).not.toContain("法典增强两阶段");
    const request = axiosMock.post.mock.calls[0]?.[1] as {
      messages?: Array<{ role: string; content: unknown }>;
    };
    expect(String(request.messages?.[0]?.content)).toContain("可复现画面");
  });
});

 it("uses live software templates on every conversion and rejects truncated output",async()=>{
  const {convertPromptText}=await import('./nai');
  settingsRef.current={convertApiUrl:'https://example.test/v1',convertApiKey:'test-only',convertApiModel:'test',convertPromptTemplates:{tags:'TAG TEMPLATE',natural:'PROSE TEMPLATE',mixed:'CUSTOM MIXED {{input}}'},reverseConvertDshEnabled:true};
  axiosMock.post.mockReset();axiosMock.post.mockResolvedValue({data:{choices:[{message:{content:'software result'},finish_reason:'stop'}]}});
  expect((await convertPromptText('雨夜撑伞','mixed')).result).toBe('software result');
  expect(axiosMock.post.mock.calls[0][1].messages[0].content).toContain('CUSTOM MIXED');
  expect(axiosMock.post.mock.calls[0][1].messages[0].content).not.toContain('Shared SillyTavern preset');
  expect(axiosMock.post.mock.calls[0][1].max_tokens).toBeGreaterThanOrEqual(3000);
  settingsRef.current.convertPromptTemplates!.mixed='EDITED LIVE';await convertPromptText('雨夜撑伞','mixed');
  expect(axiosMock.post.mock.calls[1][1].messages[0].content).toContain('EDITED LIVE');
  await convertPromptText('雨夜撑伞','natural');expect(axiosMock.post.mock.calls[2][1].messages[0].content).toContain('PROSE TEMPLATE');
  axiosMock.post.mockResolvedValue({data:{choices:[{message:{content:'partial prompt'},finish_reason:'length'}]}});
  expect((await convertPromptText('雨夜撑伞','mixed')).ok).toBe(false);
 });

it('V4.5 retains explicit range repair at most once and rejects an invalid prompt',async()=>{
 const {convertPromptText}=await import('./nai');settingsRef.current={convertApiUrl:'https://example.test/v1',convertApiKey:'test-only',convertApiModel:'test',convertPromptTemplatesV45:{mixed:'有效语义单元总数必须落在 50–150 之间',tags:'',natural:''},reverseConvertDshEnabled:false};
 const reply=(content:string)=>({data:{choices:[{message:{content},finish_reason:'stop'}]}});
 const good=Array.from({length:55},(_,i)=>'tag'+i).join(', ');axiosMock.post.mockReset();axiosMock.post.mockResolvedValueOnce(reply('too short')).mockResolvedValueOnce(reply(good));
 expect((await convertPromptText('雨夜撑伞','mixed',false,'v4.5')).result).toBe(good);expect(axiosMock.post).toHaveBeenCalledTimes(2);
 axiosMock.post.mockReset();axiosMock.post.mockResolvedValue(reply('still short'));expect((await convertPromptText('雨夜撑伞','mixed',false,'v4.5')).ok).toBe(false);expect(axiosMock.post).toHaveBeenCalledTimes(2);
});

it('V5 typed mixed diagnostics warn without blocking or making correction calls',async()=>{
 const {convertPromptText}=await import('./nai');settingsRef.current={convertApiUrl:'https://example.test/v1',convertApiKey:'test-only',convertApiModel:'test',convertPromptTemplates:{mixed:'有效语义单元 50–150；Tag 65–75%',tags:'',natural:''}};
 const good={segments:[{units:[...Array.from({length:42},(_,i)=>({kind:'tag',text:i===0?'white hair':'tag '+i})),...Array.from({length:18},(_,i)=>({kind:'natural',text:'her left arm rests gently '+i}))]}]};
 axiosMock.post.mockReset();axiosMock.post.mockResolvedValue({data:{choices:[{message:{content:JSON.stringify(good)},finish_reason:'stop'}]}});
 const result=await convertPromptText('白发女性','mixed');expect(result.ok).toBe(true);expect(result.validation).toEqual({total:60,tags:42,natural:18,tagPercent:70});expect(result.result).not.toContain('"kind"');
 good.segments[0].units[0].text='black hair';axiosMock.post.mockClear();
 axiosMock.post.mockResolvedValue({data:{choices:[{message:{content:JSON.stringify(good)},finish_reason:'stop'}]}});
 const warned=await convertPromptText('白发女性','mixed');expect(warned.ok).toBe(true);expect(warned.result).toContain('black hair');expect(warned.warnings?.join(' ')).toContain('white hair');expect(axiosMock.post).toHaveBeenCalledTimes(1);
});

describe('reverse follows live saved templates',()=>{
 const envelope=()=>({segments:[{units:[...Array.from({length:42},(_,i)=>({kind:'tag',text:i===0?'1girl':'fixture tag '+i})),...Array.from({length:18},(_,i)=>({kind:'natural',text:'her visible sleeve detail number '+i}))]}]});
 const response=(content:string)=>({data:{choices:[{message:{content},finish_reason:'stop'}]}});
 beforeEach(()=>{
  axiosMock.post.mockReset();settingsRef.current={visionApiUrl:'https://example.test/v1',visionApiKey:'test-only',visionApiModel:'test',reversePromptTemplates:{tags:'',natural:'',mixed:'SAVED V5 有效语义单元 50–150；Tag 65–75%'},reversePromptTemplatesV45:{tags:'',natural:'CUSTOM V45 NATURAL {{input}}',mixed:''}};
 });
 it('audits both known-character variants and retries with the same image',async()=>{
  const {reversePromptImage}=await import('./nai');const good=envelope();
  axiosMock.post.mockResolvedValueOnce(response(JSON.stringify({namePrompt:good,featurePrompt:{segments:[{units:[{kind:'tag',text:'1girl'}]}]}})))
   .mockResolvedValueOnce(response(JSON.stringify({namePrompt:good,featurePrompt:good})));
  const result=await reversePromptImage(Buffer.from('fixture-image').toString('base64'),'mixed','full','only visible details',true,'v5');
  expect(result.ok).toBe(true);expect(result.variants?.namePrompt.split(',')).toHaveLength(60);expect(result.variants?.featurePrompt.split(',')).toHaveLength(60);
  expect(axiosMock.post).toHaveBeenCalledTimes(2);
  const first=axiosMock.post.mock.calls[0][1],second=axiosMock.post.mock.calls[1][1];
  expect(first.messages[0].content).toContain('SAVED V5');expect(first.max_tokens).toBeGreaterThanOrEqual(7000);
  expect(second.messages[1].content[0]).toEqual(first.messages[1].content[0]);
 });
 it('stops after three invalid responses instead of returning a short success',async()=>{
  const {reversePromptImage}=await import('./nai');axiosMock.post.mockResolvedValue(response('1girl, solo, cosplay'));
  const result=await reversePromptImage(Buffer.from('fixture-image').toString('base64'),'mixed','full','',true,'v5');
  expect(result.ok).toBe(false);expect(result.prompt).toBeUndefined();expect(axiosMock.post).toHaveBeenCalledTimes(3);
 });
 it('uses the chosen V4.5 natural template without imposing the V5 contract',async()=>{
  const {reversePromptImage}=await import('./nai');axiosMock.post.mockResolvedValue(response('A woman stands beside the window. Her left hand rests on the frame while she looks towards the viewer.'));
  const result=await reversePromptImage(Buffer.from('fixture-image').toString('base64'),'natural','full','visible scene',false,'v4.5');
  expect(result.ok).toBe(true);expect(axiosMock.post.mock.calls[0][1].messages[0].content).toContain('CUSTOM V45 NATURAL');
  expect(axiosMock.post.mock.calls[0][1].messages[0].content).not.toContain('SAVED V5');
 });
});

it('legacy reverse callers without a version follow the live software selection',async()=>{
 const {reversePromptImage}=await import('./nai');axiosMock.post.mockReset();
 settingsRef.current={visionApiUrl:'https://example.test/v1',visionApiKey:'fixture',visionApiModel:'fixture',reversePromptTemplateVersion:'v4.5',reversePromptTemplatesV45:{tags:'SAVED V45 TAGS',natural:'',mixed:''},reversePromptTemplates:{tags:'WRONG V5',natural:'',mixed:''}};
 axiosMock.post.mockResolvedValue({data:{choices:[{message:{content:'1girl, solo'},finish_reason:'stop'}]}});
 expect((await reversePromptImage(Buffer.from('fixture').toString('base64'),'tags')).ok).toBe(true);
 expect(axiosMock.post.mock.calls[0][1].messages[0].content).toContain('SAVED V45 TAGS');
 settingsRef.current.reversePromptTemplatesV45!.tags='EDITED V45';
 await reversePromptImage(Buffer.from('fixture').toString('base64'),'tags');
 expect(axiosMock.post.mock.calls[1][1].messages[0].content).toContain('EDITED V45');
});

describe('prompt assistant derives selected conversion template',()=>{
 beforeEach(()=>{axiosMock.post.mockReset();settingsRef.current={convertApiUrl:'https://example.test/v1',convertApiKey:'fixture',convertApiModel:'fixture',convertPromptTemplates:{tags:'CUSTOM V5 TAGS',natural:'',mixed:''},convertPromptTemplatesV45:{tags:'CUSTOM V45 TAGS',natural:'',mixed:''}};});
 it('adds editing instructions to the selected live template without changing settings',async()=>{
  const {convertPromptText}=await import('./nai');const before=JSON.stringify(settingsRef.current);
  axiosMock.post.mockResolvedValue({data:{choices:[{message:{content:'1girl, white hair, rain'},finish_reason:'stop'}]}});
  const r=await convertPromptText('1girl, white hair','tags',false,'v4.5',{kind:'custom',instruction:'增加雨夜街道背景'});
  expect(r.ok).toBe(true);const messages=axiosMock.post.mock.calls[0][1].messages;
  expect(messages[0].content).toContain('CUSTOM V45 TAGS');expect(messages[0].content).toContain('现有正面提示词的编辑助手');
  expect(messages[1].content).toContain('增加雨夜街道背景');expect(messages[1].content).toContain('1girl, white hair');expect(JSON.stringify(settingsRef.current)).toBe(before);
 });
 it('invalid assistant input makes no network request',async()=>{
  const {convertPromptText}=await import('./nai');expect((await convertPromptText('','tags',false,'v5',{kind:'optimize',instruction:''})).ok).toBe(false);expect(axiosMock.post).not.toHaveBeenCalled();
 });
 it('assistant reports mixed statistics but malformed internal transport still fails without template retries',async()=>{
  const {convertPromptText}=await import('./nai');settingsRef.current.convertPromptTemplates!.mixed='有效语义单元 50–150；Tag 65–75%';
  const envelope={segments:[{units:[...Array.from({length:42},(_,i)=>({kind:'tag',text:i===0?'black hair':'tag '+i})),...Array.from({length:18},(_,i)=>({kind:'natural',text:'her left arm rests gently '+i}))]}]};
  axiosMock.post.mockResolvedValue({data:{choices:[{message:{content:JSON.stringify(envelope)},finish_reason:'stop'}]}});
  const r=await convertPromptText('白发女性','mixed',false,'v5',{kind:'custom',instruction:'把发色改为黑发'});
  expect(r.ok).toBe(true);expect(r.validation).toEqual({total:60,tags:42,natural:18,tagPercent:70});
  axiosMock.post.mockClear();axiosMock.post.mockResolvedValue({data:{choices:[{message:{content:'short'},finish_reason:'stop'}]}});
  expect((await convertPromptText('white hair','mixed',false,'v5',{kind:'optimize',instruction:''})).ok).toBe(false);expect(axiosMock.post).toHaveBeenCalledTimes(1);
 });
});

describe('saved-mixed derived mode transport and source facts',()=>{
 beforeEach(()=>{axiosMock.post.mockReset();settingsRef.current={convertApiUrl:'https://example.test/v1',convertApiKey:'fixture',convertApiModel:'fixture',convertPromptTemplates:{tags:'',natural:'',mixed:'有效语义单元 50–150；Tag 65–75%'},reverseConvertDshEnabled:false};});
 it('pure natural keeps the source facts without a mixed comma count',async()=>{
  const {convertPromptText}=await import('./nai');
  axiosMock.post.mockResolvedValue({data:{choices:[{message:{content:'A woman with white hair and red eyes stands on the stage.'},finish_reason:'stop'}]}});
  const r=await convertPromptText('white hair, red eyes, stage','natural',false,'v5');
  expect(r.ok).toBe(true);expect(axiosMock.post).toHaveBeenCalledTimes(1);expect(axiosMock.post.mock.calls[0][1].messages[0].content).toContain('纯自然语言');
 });
 it('custom mixed edits preserve unchanged eyes while accepting changed hair and overhead lighting',async()=>{
  const {convertPromptText}=await import('./nai');
  const envelope={segments:[{units:[...Array.from({length:42},(_,i)=>({kind:'tag',text:['1girl','black hair','red eyes','upper body'][i]??'fixture tag '+i})),...Array.from({length:18},(_,i)=>({kind:'natural',text:'her visible sleeve catches light '+i}))]}]};
  const response=()=>({data:{choices:[{message:{content:JSON.stringify(envelope)},finish_reason:'stop'}]}});
  axiosMock.post.mockResolvedValue(response());
  const input='1girl, white hair, red eyes, upper body, she is lit from above by a spotlight';
  expect((await convertPromptText(input,'mixed',false,'v5',{kind:'custom',instruction:'把发色改为黑发'})).ok).toBe(true);expect(axiosMock.post).toHaveBeenCalledTimes(1);
  envelope.segments[0].units[2].text='blue eyes';axiosMock.post.mockReset();axiosMock.post.mockImplementation(async()=>response());
  const invalid=await convertPromptText(input,'mixed',false,'v5',{kind:'custom',instruction:'把发色改为黑发'});
  expect(invalid.ok).toBe(true);expect(invalid.result).toContain('blue eyes');expect(invalid.warnings?.join(' ')).toContain('red eyes');expect(axiosMock.post).toHaveBeenCalledTimes(1);
 });
});

it('requests documented JSON output on official DeepSeek only for typed prompts',async()=>{
 const {convertPromptText}=await import('./nai');axiosMock.post.mockReset();
 settingsRef.current={convertApiUrl:'https://api.deepseek.com',convertApiKey:'fixture',convertApiModel:'deepseek-v4-flash-vision-exp',convertPromptTemplates:{tags:'',natural:'',mixed:'有效语义单元 50–150；Tag 65–75%'}};
 const units=[...Array.from({length:42},(_,i)=>({kind:'tag',text:'fixture tag '+i})),...Array.from({length:18},(_,i)=>({kind:'natural',text:'a visible sleeve detail '+i}))];
 axiosMock.post.mockResolvedValue({data:{choices:[{message:{content:JSON.stringify({segments:[{units}]})},finish_reason:'stop'}]}});
 expect((await convertPromptText('一个舞台场景','mixed')).ok).toBe(true);expect(axiosMock.post.mock.calls[0][1].response_format).toEqual({type:'json_object'});
 axiosMock.post.mockClear();settingsRef.current.convertApiUrl='https://relay.example/v1';
 expect((await convertPromptText('一个舞台场景','mixed')).ok).toBe(true);expect(axiosMock.post.mock.calls[0][1]).not.toHaveProperty('response_format');
});

it('pure Tag conversion audits the derived range and JSON transport before success',async()=>{
 const {convertPromptText}=await import('./nai');axiosMock.post.mockReset();
 settingsRef.current={convertApiUrl:'https://api.deepseek.com',convertApiKey:'fixture',convertApiModel:'fixture',convertPromptTemplates:{tags:'',natural:'',mixed:'有效语义单元 50–150；Tag 65–75%'}};
 const response=(count:number)=>({data:{choices:[{message:{content:JSON.stringify({segments:[{units:Array.from({length:count},(_,i)=>({kind:'tag',text:'visible tag '+i}))}]})},finish_reason:'stop'}]}});
 axiosMock.post.mockResolvedValueOnce(response(46)).mockResolvedValueOnce(response(60));
 const result=await convertPromptText('场景布局与细节','tags');expect(result.ok).toBe(true);expect(result.result?.split(',')).toHaveLength(60);expect(axiosMock.post).toHaveBeenCalledTimes(2);expect(axiosMock.post.mock.calls[0][1].response_format).toEqual({type:'json_object'});
});

describe('V4.5 retains bounded shared mixed structural and delta repair',()=>{
 const reply=(value:unknown)=>({data:{choices:[{message:{content:JSON.stringify(value)},finish_reason:'stop'}]}});
 const source='两人漫画场景，两位成年女性在室内柜台旁交接一个纸袋，不增加人物。';
 const envelope=()=>{
  const tags=[
   ['2girls','indoors','shop','daytime','window','wooden floor','counter','eye level','upper body','medium shot','comic','natural light'],
   ['girl','woman','black hair','short hair','brown eyes','white shirt','blue pants','long sleeves','standing','sideways glance','gentle smile','paper bag','holding bag','source#giving','left profile'],
   ['girl','adult','brown hair','long hair','green eyes','gray sweater','black pants','long sleeves','standing','looking at another','smile','reaching out','target#giving','right profile','open hand'],
  ];
  const natural=[
   ['the counter lies behind both women','the window casts light across the counter','the floor remains visible behind the counter','the scene centers on the bag handover','the women face each other across the counter','the bag is the focus of their interaction'],
   ['her left hand holds the bag handle','her right hand supports the bag base','her eyes follow the other woman receiving it','her sleeve rests beside the bag handle','her upper body leans toward the receiver','her fingers loosen as the receiver grips it'],
   ['her left hand reaches for the handle','her right hand supports the incoming bag','her eyes follow the bag being handed over','her sleeve stops beside the counter edge','her upper body faces the giver directly','her fingers close around the offered handle'],
  ];
  return {segments:tags.map((units,index)=>({units:[...units.map(text=>({kind:'tag',text})),...natural[index].map(text=>({kind:'natural',text}))]}))};
 };
 beforeEach(()=>{
  axiosMock.post.mockReset();settingsRef.current={convertApiUrl:'https://example.test/v1',convertApiKey:'fixture-only',convertApiModel:'fixture',convertPromptTemplatesV45:{mixed:'有效语义单元 50–150；Tag 65–75%',tags:'',natural:''},reverseConvertDshEnabled:false};
 });
 for(const assistant of [undefined,{kind:'custom' as const,instruction:'保留两位成年女性和纸袋，修正多人结构。'}]) {
  it(`same mixed path permits one full role repair: ${assistant?'custom assistant':'Chinese conversion'}`,async()=>{
   const {convertPromptText}=await import('./nai');const good=envelope(),bad=envelope();
   [bad.segments[1].units[0],bad.segments[1].units[1]]=[bad.segments[1].units[1],bad.segments[1].units[0]];
   axiosMock.post.mockResolvedValueOnce(reply(bad)).mockResolvedValueOnce(reply(good));
   const result=await convertPromptText(source,'mixed',false,'v4.5',assistant);
   expect(result.ok).toBe(true);expect(result.validation).toEqual({total:60,tags:42,natural:18,tagPercent:70});
   expect(axiosMock.post).toHaveBeenCalledTimes(2);expect(result.result).toContain('paper bag');
   const repair=axiosMock.post.mock.calls[1][1].messages[0].content;
   expect(repair).toContain('一次完整 segments');expect(repair).toContain('{"segments":');expect(repair).not.toContain('根字段仅 replace/append/remove');
  });
 }
 it('unit-only repair has one delta root protocol and keeps valid facts',async()=>{
  const {convertPromptText}=await import('./nai');const bad=envelope();bad.segments[1].units[15].text='her left hand holds the bag handle, gently';
  axiosMock.post.mockResolvedValueOnce(reply(bad)).mockResolvedValueOnce(reply({replace:[{segment:1,index:15,unit:{kind:'natural',text:'her left hand holds the bag handle gently'}}]}));
  const result=await convertPromptText(source,'mixed',false,'v4.5');expect(result.ok).toBe(true);expect(axiosMock.post).toHaveBeenCalledTimes(2);
  const repair=axiosMock.post.mock.calls[1][1].messages[0].content;
  expect(repair).toContain('根字段仅 replace/append/remove');expect(repair).not.toContain('{"segments":');expect(repair).not.toContain('返回 JSON 对象');
 });
 it('a misplaced first clothing fact survives complete structure repair',async()=>{
  const {convertPromptText}=await import('./nai');const good=envelope(),bad=envelope();
  bad.segments[1].units.unshift(bad.segments[1].units.splice(5,1)[0]);
  axiosMock.post.mockResolvedValueOnce(reply(bad)).mockResolvedValueOnce(reply(good));
  expect((await convertPromptText(source,'mixed',false,'v4.5')).ok).toBe(true);expect(axiosMock.post).toHaveBeenCalledTimes(2);
 });
 it('a role missing a relation can use delta even when ratio additions were zero',async()=>{
  const {convertPromptText}=await import('./nai');const bad=envelope();
  bad.segments[0].units.push(...bad.segments[2].units.splice(15));
  axiosMock.post.mockResolvedValueOnce(reply(bad)).mockResolvedValueOnce(reply({append:[{segment:2,units:[{kind:'natural',text:'the right woman receives the paper bag'}]}]}));
  const result=await convertPromptText(source,'mixed',false,'v4.5');expect(result.ok).toBe(true);expect(result.validation?.total).toBe(61);expect(axiosMock.post).toHaveBeenCalledTimes(2);
  const repair=axiosMock.post.mock.calls[1][1].messages[0].content;expect(repair).toContain('这不是硬配额');expect(repair).toContain('根字段仅 replace/append/remove');
 });
 it('full repair cannot erase a valid first clothing fact or rewrite unrelated facts',async()=>{
  const {convertPromptText}=await import('./nai');const bad=envelope(),loss=envelope();
  bad.segments[1].units.unshift(bad.segments[1].units.splice(5,1)[0]);
  loss.segments[1].units[5].text='blue shirt';
  axiosMock.post.mockResolvedValueOnce(reply(bad)).mockResolvedValueOnce(reply(loss)).mockResolvedValueOnce(reply({remove:[{segment:1,index:0}]}));
  const result=await convertPromptText(source,'mixed',false,'v4.5');expect(result.ok).toBe(false);expect(result.result).toBeUndefined();
  expect(result.message).toContain('丢失已合格单元');expect(result.message).toContain('white shirt');expect(axiosMock.post).toHaveBeenCalledTimes(3);
 });
 it('only one complete structural repair is allowed and invalid output never succeeds',async()=>{
  const {convertPromptText}=await import('./nai');const bad=envelope();[bad.segments[1].units[0],bad.segments[1].units[1]]=[bad.segments[1].units[1],bad.segments[1].units[0]];
  axiosMock.post.mockResolvedValueOnce(reply(bad)).mockResolvedValueOnce(reply(bad)).mockResolvedValueOnce(reply({}));
  const result=await convertPromptText(source,'mixed',false,'v4.5');expect(result.ok).toBe(false);expect(result.result).toBeUndefined();expect(axiosMock.post).toHaveBeenCalledTimes(3);
  expect(axiosMock.post.mock.calls[1][1].messages[0].content).toContain('一次完整 segments');
  expect(axiosMock.post.mock.calls[2][1].messages[0].content).toContain('根字段仅 replace/append/remove');
 });
 it('delta cannot delete an unrelated valid fact to obtain a passing ratio',async()=>{
  const {convertPromptText}=await import('./nai');const bad=envelope();bad.segments[1].units[15].text='her left hand holds the bag handle, gently';
  const patch={replace:[{segment:1,index:15,unit:{kind:'natural',text:'her left hand holds the bag handle gently'}}],remove:[{segment:1,index:5}]};
  axiosMock.post.mockResolvedValueOnce(reply(bad)).mockResolvedValueOnce(reply(patch)).mockResolvedValueOnce(reply(patch));
  const result=await convertPromptText(source,'mixed',false,'v4.5');expect(result.ok).toBe(false);expect(result.result).toBeUndefined();expect(result.message).toContain('white shirt');expect(axiosMock.post).toHaveBeenCalledTimes(3);
 });
 it('full repair cannot swap qualified hair facts between the two adults',async()=>{
  const {convertPromptText}=await import('./nai');const bad=envelope(),swapped=envelope();
  [bad.segments[1].units[0],bad.segments[1].units[1]]=[bad.segments[1].units[1],bad.segments[1].units[0]];
  [swapped.segments[1].units[2],swapped.segments[2].units[2]]=[swapped.segments[2].units[2],swapped.segments[1].units[2]];
  axiosMock.post.mockResolvedValueOnce(reply(bad)).mockResolvedValueOnce(reply(swapped)).mockResolvedValueOnce(reply({}));
  const result=await convertPromptText(source,'mixed',false,'v4.5');expect(result.ok).toBe(false);expect(result.result).toBeUndefined();expect(axiosMock.post).toHaveBeenCalledTimes(3);
 });
 it('ambiguous resegmentation does not guess the ownership of existing facts',async()=>{
  const {convertPromptText}=await import('./nai');const bad=envelope(),resegmented=envelope();
  [bad.segments[1].units[0],bad.segments[1].units[1]]=[bad.segments[1].units[1],bad.segments[1].units[0]];
  resegmented.segments[0].units[0].text='3girls';resegmented.segments.push({units:[{kind:'tag',text:'girl'},{kind:'natural',text:'her hands rest beside the counter'}]});
  axiosMock.post.mockResolvedValueOnce(reply(bad)).mockResolvedValueOnce(reply(resegmented)).mockResolvedValueOnce(reply({}));
  const result=await convertPromptText(source,'mixed',false,'v4.5');expect(result.ok).toBe(false);expect(result.result).toBeUndefined();expect(axiosMock.post).toHaveBeenCalledTimes(3);
 });
 it('base-count repair cannot silently remove a valid weighted role marker',async()=>{
  const {convertPromptText}=await import('./nai');const bad=envelope(),loss=envelope();
  bad.segments[0].units[0].text='3girls';bad.segments[1].units[0].text='1.2::girl::';
  const patch={replace:[{segment:0,index:0,unit:{kind:'tag',text:'2girls'}},{segment:1,index:0,unit:{kind:'tag',text:'girl'}}]};
  axiosMock.post.mockResolvedValueOnce(reply(bad)).mockResolvedValueOnce(reply(loss)).mockResolvedValueOnce(reply(patch));
  const result=await convertPromptText(source,'mixed',false,'v4.5');expect(result.ok).toBe(false);expect(result.result).toBeUndefined();expect(result.message).toContain('1.2::girl::');expect(axiosMock.post).toHaveBeenCalledTimes(3);
 });
});

describe('V5 mixed warning-only policy for both entrances',()=>{
 const reply=(content:string)=>({data:{choices:[{message:{content},finish_reason:'stop'}]}});
 const envelope=(tags=32,natural=13)=>({segments:[{units:[
  ...Array.from({length:tags},(_,i)=>({kind:'tag',text:i===0?'1girl':'scene tag '+i})),
  ...Array.from({length:natural},(_,i)=>({kind:'natural',text:'her sleeve rests beside the counter '+i}))
 ]}]});
 beforeEach(()=>{axiosMock.post.mockReset();settingsRef.current={convertApiUrl:'https://example.test/v1',convertApiKey:'fixture-only',convertApiModel:'fixture',convertPromptTemplates:{mixed:'有效语义单元 50–150；Tag 65–75%',tags:'',natural:''},reverseConvertDshEnabled:false};});
 for(const assistant of [undefined,{kind:'custom' as const,instruction:'保留明确画面事实。'}])it(`returns an under-range prompt with warnings in one call: ${assistant?'assistant':'convert'}`,async()=>{
  const {convertPromptText}=await import('./nai');axiosMock.post.mockResolvedValue(reply(JSON.stringify(envelope())));
  const r=await convertPromptText('柜台旁的一位成年女性','mixed',false,'v5',assistant);
  expect(r.ok).toBe(true);expect(r.result).toContain('scene tag');expect(r.warnings?.join(' ')).toContain('有效单元 45');expect(r.validation?.total).toBe(45);expect(axiosMock.post).toHaveBeenCalledTimes(1);
 });
 it('returns explicit attribute conflicts as warnings rather than silently correcting facts',async()=>{
  const {convertPromptText}=await import('./nai');const e=envelope(42,18);e.segments[0].units[1].text='black hair';e.segments[0].units[2].text='blue eyes';
  axiosMock.post.mockResolvedValue(reply(JSON.stringify(e)));const r=await convertPromptText('单人白发红眼女性','mixed');
  expect(r.ok).toBe(true);expect(r.result).toContain('black hair');expect(r.result).toContain('blue eyes');expect(r.warnings?.join(' ')).toContain('white hair');expect(r.warnings?.join(' ')).toContain('red eyes');expect(axiosMock.post).toHaveBeenCalledTimes(1);
 });
 it('returns wrong ratio and role/base diagnostics without applying model-driven structure repairs',async()=>{
  const {convertPromptText}=await import('./nai');const e=envelope(52,8);e.segments[0].units[0].text='3girls';e.segments.push({units:[{kind:'tag',text:'woman'},{kind:'tag',text:'blue shirt'}]});
  axiosMock.post.mockResolvedValue(reply(JSON.stringify(e)));const r=await convertPromptText('两位成年女性','mixed');
  expect(r.ok).toBe(true);expect(r.result).toContain('woman, blue shirt');expect(r.warnings?.join(' ')).toContain('角色段');expect(r.warnings?.join(' ')).toContain('base 人数');expect(axiosMock.post).toHaveBeenCalledTimes(1);
 });
 it('a custom plaintext V5 mixed count-only template is also advisory',async()=>{
  const {convertPromptText}=await import('./nai');settingsRef.current.convertPromptTemplates!.mixed='有效语义单元 50–150';
  axiosMock.post.mockResolvedValue(reply('1girl, blue shirt'));const r=await convertPromptText('成年女性穿蓝色衬衫','mixed');
  expect(r.ok).toBe(true);expect(r.result).toBe('1girl, blue shirt');expect(r.warnings?.join(' ')).toContain('模板要求 50');expect(axiosMock.post).toHaveBeenCalledTimes(1);
 });
 for(const content of ['', 'not json', '{"segments":[]}'])it('keeps unusable internal transport as failure: '+JSON.stringify(content),async()=>{
  const {convertPromptText}=await import('./nai');axiosMock.post.mockResolvedValue(reply(content));const r=await convertPromptText('柜台旁的成年女性','mixed');
  expect(r.ok).toBe(false);expect(r.result).toBeUndefined();expect(axiosMock.post).toHaveBeenCalledTimes(1);
 });
 it('API transport failure is not converted into an applicable warning result',async()=>{
  const {convertPromptText}=await import('./nai');axiosMock.post.mockRejectedValue(new Error('fixture API failed'));
  const r=await convertPromptText('柜台旁的成年女性','mixed');expect(r.ok).toBe(false);expect(r.result).toBeUndefined();expect(r.message).toContain('转换失败');
 });
});
