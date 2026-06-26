import type { ComicConvertRequest } from "../types";

type PanelInput = ComicConvertRequest["panels"][number];

const LOCAL_TAG_RULES: Array<[RegExp, string[]]> = [
  [/(少女|女孩|女子|女主|她)/u, ["1girl"]],
  [/(少年|男孩|男子|男主|他)/u, ["1boy"]],
  [/(两人|二人|一男一女|男女主)/u, ["2people"]],
  [/(全身|从头到脚)/u, ["full body"]],
  [/(半身|上半身)/u, ["upper body"]],
  [/(特写|近景|脸部)/u, ["close-up", "portrait"]],
  [/(远景|广角|全景)/u, ["wide shot"]],
  [/(俯视|鸟瞰)/u, ["from above"]],
  [/(仰视|低角度)/u, ["from below"]],
  [/(背影|背对)/u, ["from behind"]],
  [/(侧脸|侧面)/u, ["profile"]],
  [/(看向镜头|看着镜头|直视)/u, ["looking at viewer"]],
  [/(站立|站着)/u, ["standing"]],
  [/(坐下|坐着)/u, ["sitting"]],
  [/(走路|行走|走向)/u, ["walking"]],
  [/(奔跑|跑向|逃跑)/u, ["running"]],
  [/(战斗|打斗|交战)/u, ["fighting", "dynamic pose"]],
  [/(拥抱|抱住)/u, ["hugging"]],
  [/(牵手|握手)/u, ["holding hands"]],
  [/(拿着|手持|握着)/u, ["holding"]],
  [/(微笑|笑着|笑容)/u, ["smile"]],
  [/(哭泣|流泪|眼泪)/u, ["crying", "tears"]],
  [/(惊讶|震惊)/u, ["surprised"]],
  [/(生气|愤怒)/u, ["angry"]],
  [/(悲伤|难过)/u, ["sad"]],
  [/(室内|房间|卧室|客厅)/u, ["indoors"]],
  [/(室外|户外)/u, ["outdoors"]],
  [/(街道|街头|巷子)/u, ["street"]],
  [/(学校|教室)/u, ["school", "classroom"]],
  [/(森林|树林)/u, ["forest"]],
  [/(城市|都市)/u, ["city"]],
  [/(海边|海滩)/u, ["beach", "ocean"]],
  [/(夜晚|深夜|夜色)/u, ["night"]],
  [/(黄昏|傍晚|夕阳)/u, ["sunset"]],
  [/(清晨|黎明)/u, ["dawn"]],
  [/(下雨|雨夜|雨中)/u, ["rain", "wet"]],
  [/(下雪|雪中|雪地)/u, ["snow"]],
  [/(雾|迷雾)/u, ["fog"]],
  [/(逆光)/u, ["backlighting"]],
  [/(柔光|柔和光线)/u, ["soft lighting"]],
  [/(戏剧性光影|强烈光影)/u, ["dramatic lighting"]],
  [/(长发)/u, ["long hair"]],
  [/(短发)/u, ["short hair"]],
  [/(白发|银发)/u, ["white hair"]],
  [/(黑发)/u, ["black hair"]],
  [/(蓝发)/u, ["blue hair"]],
  [/(红发)/u, ["red hair"]],
  [/(金发)/u, ["blonde hair"]],
  [/(蓝眼|蓝色眼睛)/u, ["blue eyes"]],
  [/(红眼|红色眼睛)/u, ["red eyes"]],
  [/(校服)/u, ["school uniform"]],
  [/(裙子|连衣裙)/u, ["dress"]],
  [/(和服)/u, ["kimono"]],
  [/(盔甲|铠甲)/u, ["armor"]],
];

function uniqueTags(tags: string[]) {
  const seen = new Set<string>();
  return tags.filter((tag) => {
    const normalized = tag.trim().replace(/\s+/g, " ");
    if (!normalized || seen.has(normalized.toLowerCase())) return false;
    seen.add(normalized.toLowerCase());
    return true;
  });
}

function asciiPromptHints(text: string) {
  const hints = text
    .split(/[\n,，;；]+/)
    .map((value) => value.trim())
    .filter((value) =>
      value.length >= 3
      && value.length <= 90
      && /[a-z]/i.test(value)
      && !/https?:\/\//i.test(value)
      && !/[\u3400-\u9fff]/u.test(value));
  return hints.slice(0, 24);
}

export function isTuiwenPromptRefusal(text: string) {
  return /(?:\bi (?:can(?:not|'t)|won't)\b|\bsorry\b|\bunable to\b|抱歉|无法(?:协助|提供|生成)|不能(?:帮助|生成))/iu.test(text);
}

export function buildTuiwenLocalPrompt(
  request: Pick<
    ComicConvertRequest,
    "mode" | "globalStylePrompt" | "globalCharacterSetting" | "referencePrompts"
  >,
  panel: Pick<PanelInput, "cnPrompt">,
) {
  const tags = [
    "masterpiece",
    "best quality",
    "amazing quality",
    "very aesthetic",
    "anime illustration",
    ...asciiPromptHints(request.globalStylePrompt),
    ...asciiPromptHints(request.globalCharacterSetting),
    ...request.referencePrompts.flatMap(asciiPromptHints),
  ];
  for (const [pattern, mapped] of LOCAL_TAG_RULES) {
    if (pattern.test(panel.cnPrompt)) tags.push(...mapped);
  }
  tags.push("coherent character design", "cinematic composition", "detailed background");
  const result = uniqueTags(tags).join(", ");
  return request.mode === "natural"
    ? `Anime illustration, ${result}.`
    : result;
}
