import { DEFAULT_PARAMS, type ComicProject } from "./types";

export const DEFAULT_COMIC_SCRIPT = `主角在网上买了伊德海莉新头壳和新皮套。商品随箱附赠操作说明，强调实验品不能佩戴超过24小时，否则可能产生不可逆后果。
穿上皮衣、戴上头壳后，头壳自动变化，外观和角色无差别，服装也一样。
主角参加漫展，大家都觉得头壳很还原，简直像本人。
回家之后主角不想摘下，戴着头壳睡下；第二天醒来发现皮套拉链消失，自己被彻底变成角色。

1-7：购买皮套，到皮套送到，主角拿着皮套打量。
8-15：主角穿上皮套，反复确认自己新的身材和样子。
16-24：主角去了漫展，回来后累得睡下，第二天醒来发现皮套还在身上，想脱下但发现拉链消失。`;

export const DEFAULT_COMIC_CHARACTER_SETTING = `主角原本样子参考三视图：成年青年，黑色短发，普通体型，黑色宽松短袖，黑色短裤，黑色拖鞋，气质普通宅男，表情略内向。
伊德海莉外观参考三视图：严格参考伊德海莉角色设计图，保持发型、发色、瞳色、服装结构、配饰、整体轮廓一致，不要擅自更改角色特征。
皮套设定：高科技仿生角色皮套，折叠时像完整角色服装和仿生外皮，穿上后贴合身体，材质细腻但不暴露。
头壳设定：高科技仿生头壳，内部有微弱蓝紫色光效，戴上后会自动调整外观，最终与伊德海莉本人无差别。
重要限制：画面不要出现裸露，不要色情，不要夸张身体特写，不要血腥，不要恐怖重口，重点表现悬疑、惊讶、不可逆变化。`;

export const DEFAULT_COMIC_PANELS = [
  "深夜房间，主角坐在电脑前浏览网购页面，屏幕上展示伊德海莉新头壳与新皮套的商品图，眼神兴奋又犹豫。",
  "主角凑近屏幕，手指停在鼠标上准备点击购买按钮，商品图片呈现头壳和皮套剪影。",
  "数日后，快递纸箱放在房间门口，主角弯腰拿起纸箱，纸箱贴着黑紫色实验品标签。",
  "主角坐在地板上拆快递箱，箱内露出黑紫色高级收纳盒和淡蓝紫色指示灯。",
  "主角打开收纳盒，里面整齐放着仿生皮套、头壳、手套、鞋饰和说明书。",
  "主角阅读操作说明书，警示图标强调实验品单次佩戴不得超过24小时。",
  "主角把皮套从盒中轻轻提起打量，站在镜子前若有所思，旁边放着头壳和说明书。",
  "主角把手臂伸入高科技皮套袖口，皮套自动贴合手臂并亮起细小蓝紫色纹路。",
  "主角穿好大部分皮套站在镜子前，服装层次逐渐贴合角色造型。",
  "主角拿起仿生头壳，头壳内部有淡淡蓝紫色光芒，表情紧张又期待。",
  "主角戴上头壳的一瞬间，边缘自动闭合，柔和光线沿着脸部轮廓扩散。",
  "镜子前头壳外观开始变化，发型、发色、面部轮廓逐渐向伊德海莉靠近。",
  "主角完全穿戴完成，站在全身镜前，外观与伊德海莉高度一致。",
  "主角在镜子前转身检查背面和侧面，用镜面多重反射表现正面、侧面、背面。",
  "主角拿起手机自拍，对着镜子摆出伊德海莉风格姿势，背景有打开的收纳盒。",
  "第二天漫展入口，主角以伊德海莉外观来到会场，周围有路人 coser 和展牌。",
  "漫展大厅内几名游客请求合影，主角站在中间，姿势优雅，害羞又开心。",
  "主角走过展区通道，路人回头注视，主角逐渐沉浸在角色外观中。",
  "摄影师举起相机拍摄，主角以伊德海莉标志性气质站姿回应镜头。",
  "漫展休息区，主角坐在长椅上喝水，看着倒影，表情开心又有些不安。",
  "夜晚回家，主角仍穿着皮套和头壳，疲惫地打开房门，说明书还在桌上。",
  "主角坐在床边准备摘下头壳，但动作停住，镜子里映出伊德海莉的样子。",
  "主角最终没有摘下，直接躺在床上睡着，收纳盒敞开，说明书掉在地上。",
  "第二天清晨，主角醒来发现皮套仍在身上，背后拉链消失，镜中映出彻底变成伊德海莉的样子。",
];

export function createDefaultComicProject(params = DEFAULT_PARAMS): ComicProject {
  return {
    id: crypto.randomUUID(),
    title: "伊德海莉皮套悬疑短篇",
    rawScript: DEFAULT_COMIC_SCRIPT,
    mode: "natural",
    desiredPanelCount: "auto",
    globalPrompt: DEFAULT_COMIC_SCRIPT,
    globalCharacterSetting: DEFAULT_COMIC_CHARACTER_SETTING,
    continuityBible: "",
    globalStylePrompt: params.stylePrompt,
    globalNegativePrompt: params.negativePrompt,
    adultBranch: false,
    inheritPreviousFrame: false,
    autoExportZip: false,
    globalParams: { ...params, positivePrompt: "" },
    references: [],
    panels: DEFAULT_COMIC_PANELS.map((cnPrompt, index) => ({
      id: crypto.randomUUID(),
      index: index + 1,
      cnPrompt,
      contextSummary: cnPrompt.slice(0, 120),
      enPrompt: "",
      localNegativePrompt: "",
      negativeMode: "append",
      paramsOverride: { enabled: false, params: {} },
      status: "draft",
    })),
  };
}
