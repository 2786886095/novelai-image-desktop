# NovelAI V5 Full 图片反推｜混合（约 70% Tag + 30% 自然语言）

上传图片：
{{image}}

用户要求：
{{input}}


## 0 先查元数据
`read_image_metadata` 读 prompt/character prompts/seed/sampler/stylePrompt。
- **有原文**（完整参数）→ 默认**交原文或照原文改**并明说「带原文」；不许盲推冒充。
- **用户要「反推/盲推/对照」**→ 先只读图写稿保留，再展开元数据逐项对照；已读过原文须声明「参考过原文」。
- **无原文/不完整** → 正常反推并声明「本稿为推测」。
- 交付分标：**原文/用户给的/推测**；推测不冒充原文。

## 1 输出契约（默认形态 A）
- **A（默认）= 正文一行 prompt（必须）＋ 元信息行 0–2 行（可省略，`#` 开头、非 prompt）**：正文无解释/标题/Markdown/编号/换行，多人 `|` 同一行；复制时不带 `#` 行。
- **元信息行**：`#参考原文` 仅当用户要求说明来源时输出；`#单元数: N（输入事实所限）` 仅当用户问「够不够/自检」时输出。
- **B（贴工作台/带角色框/直接出图）**：A 后三段代码块：`主串`／每人 `Character N:`（左→右）／`UC:`；质量尾写完再关主串块，UC 一遍。
- **C（给参数）**：A/B 后另起 `---params---`（§11），不进 prompt。
- B/C 不默认输出；A 里不许夹参数块。
- **交付前自检三条**：① 中文计数 = 0（`Text:` 载荷除外）② 每个句子前面都有 `, ` ③ 一个角色段只对应一格。

## 2 三件套：画风头／质量尾／UC
**默认不用风格提示词、不用质量提示词、不用负面提示词、不写色彩档词。**
- **画风头（画师串）**：**默认不写**——不写画师名、不写风格串；用户明确要画风时由**用户自己**在 style 字段填，模板不代填、正文不写。`[实测支持]` 画风串只改画风色调。
- **质量尾**：**默认不写**——正文不写 `masterpiece`/`best quality`/`very aesthetic`/`absurdres`；只有用户明确要质量词时才加。
- **stylePrompt / negativePrompt / qualityPreset / ucPreset：一律不传（默认不用负面提示词）**——软件已锁定画师串（含 artist 权重 + masterpiece + 年份词）与负面串（worst quality/lowres/bad anatomy/screentone/multiple views…），模板不重复写、不覆盖；调用只传 `positivePrompt` + model/width/height/steps/cfgScale/sampler/noiseSchedule/seed/effort。用户要换风格/负面时自己在软件里改。
- **色彩档词：默认一个都不写**——不加 `monochrome`/`greyscale`/`screentones`/`pure black and white`/`no color`，也不加 `full color`/`anime coloring`/`cel shading`/`colorful`；色彩由软件风格提示词与设置决定；负面也不追加色彩档词。只有用户明确要「黑白漫画」时才加 `monochrome, greyscale`。
- `[实测支持]` **正文负权重是删属性/删元素的首选，优先于 negativePrompt 字段**（字段删不掉已被正面描述的元素）：改属性用 `-1::`（`-1::red umbrella ::` 红像素 −94.5%）、删物体用 `-3::`（`-2::` 无增量），写 base 段末第一个 `|` 前；**生效前提：先删掉别处同义描述**；`-4::` 未测。
- **不从画面推** 画风串、质量词、色彩档词、负权重。

## 3 正文语言形态与结构（Tag 65–75% + 关系句）
- 正文 = tag 管人数/身份/外貌/服装/场景/光线/镜头/姿势表情 + **关系句**补 tag 难表达处。
- **正文默认纯英文**：tag 英文，**关系句也写英文**。理由三条：
  ① 八个模板统一口径，便于批量生成与机器校验；
  ② 中英混写时中文句子很容易和 tag 粘在一起（少一个逗号就变成一个超长片段），出图时会连带前面的 tag 一起失效；
  ③ V5 对中文的读取不稳定，容易被当成「要画在画面上的字」。
  `[实测支持]` 早期 T11 测过「中文关系句略优于英文句」，但那条只在**整段都是中文句**时成立；混写不成立。**中文关系句降为可选**：用户明确要「用中文写关系句」时才用，且必须满足下面两条边界规则。
- **全中文不设为默认** `[实测支持]`：连 tag 用中文会幻觉伪文字招牌 → 避开招牌语义，加 `text`/`logo`/`sign` 负面。
- **Tag 规范**：成熟 Danbooru tag 优先、空格不用下划线；结构/数量/体型/颜色隔离四类**允许直接用描述性英文短语**（实测 `small transom panes` 等非词表短语 V5 照样执行），不必强求词表存在。不堆近义词/拆解词；无复合 tag 用最短属性名词组合；道具颜色/材质/状态独立，同一对象颜色只写一次。
- **结构与关系句**：每段先 tag 后关系句；base 顺序 tag→全局关系句→排除项→text tag→`Text:`；角色关系句放段末。关系句要有主语+限定谓语，只补 tag 难表达处：位置、哪只手/身体侧、触碰/支撑、朝向/注视目标、前后层次、遮挡。**不用长 tag 加句号、不复述已有 tag、不按逗号凑数**；简单画面 ≥2 句，多人每人 ≥1 句。

- **句子边界三条硬规则**（中文句或英文句都适用）：
  1. **句子必须用 `, ` 与 tag 分隔**，不许直接粘在 tag 后面（`torn paper 整页排成四格` ❌ → `torn paper, the page is divided into four panels` ✅）。
  2. **一个角色段只写一格的内容**。多格页里每格必须各自开一段；把「左上格她…左下格她…」塞进同一段，V5 只会执行其中一格。
  3. **句子只写画面事实，不写版式推理**：`二乘二`、`左上格`、`第一格` 这类版式描述属于主串的版式句，不进角色段。

- **一句只写一个动作；不许写互相矛盾的修饰** `[实测支持]`：`closed-position` 与 `open` 并存 → V5 只执行一半，红伞「杆在手上、弯柄飘在桌上」；一句塞「握伞柄 + 手搭桌沿」两个动作 → 握伞动作整体丢失。**同一道具的开合状态、位置只写一次，且前后一致。**

## 4 证据顺序与范围
① 身份：发/瞳/耳饰/颈饰/痣妆　② 体型：身高感/肩腰胯/四肢/肤色　③ 服装：主名词→轮廓→领型袖型→材质→工艺→穿着状态　④ 场景：空间/地面/墙面/家具/陈设　⑤ 光线：方位/明暗/色温/光源　⑥ 镜头：景别/机位/景深/前后景　⑦ 手与身体：哪只手/状态/重心/朝向
取景外/被遮挡不写；不默认补场景/服装/道具/表情/人物。未指定时反推整图；点名目标时只写目标，其余最少保留，≥50 按目标可见内容判定。

- **稳定属性判读纪律**：瞳色、发色、发带/饰物这类**跨图必须一致**的稳定属性，判读不确定时用**保守描述**（如 `grey-blue eyes` 而不是断言 `green eyes`），或写进 `#单元数` 那类元信息行标注存疑；**不要把推测写成确定值**。

- **光色措辞** `[实测支持]`：清晨/白天写 `warm morning light` / `golden morning sunlight`；写 `cool` 会把画面拽成**夜调**。要冷调就明确接受「黎明前」的读感。

## 5 手部与镜头判据
**手** ① 判**手背还是掌心**：指甲/指背关节/手背肌腱→手背；掌纹/掌心凹陷/指内曲→掌心。② 定**左右**：按人物自身左右，不按画面。③ 写**朝向与伸向**：掌朝观众/自己/对方；伸向谁、接触哪。④ 判据被袖口/裁切/透视挡住→只写能确认的轮廓与伸向。
**镜头高度 vs 低头抬头** ① 看**能看到顶面还是底面**：见桌面/头顶/地面→俯视；见桌底/下巴/天花板→仰视。② 看**透视与地平线**：地平线低、下半身缩短→仰拍；地平线高、上半身缩短→俯拍。③ 低头/抬头/平视是人物动作、与机位无关。④ **近大远小只说明距离与透视，不能单独定仰俯**。⑤ 线索不足→只留可确认景别。

- **机位与头部动作互斥** `[实测支持]`：`straight-on`/`from front` 与 `head down`/`looking at own hands` **不能同写**——同写时 V5 一律选机位、放弃低头（抬头看镜头）。**要低头就用 `from above`/`from slightly above`/不写机位。**
- **手部**：手部是 V5 最不稳定部件，质量靠**换手势（并拢/侧向/虚化）+ 取景（远景/手出画）**规避，**不靠 `hand focus` 或负面词** `[实测支持]`。**只写 `hands up` 不保证手画对。**

## 6 计数与比例（口径：有效单元 = tag + 关系句）
- **密度两级制** `[实测支持]`：**有效单元 = 每个不同实义 tag 计 1、每个完整关系句计 1（句内逗号不膨胀）**；**草稿档**≈22 内容 tag + 4 类必写词（14/16）；**终稿档** 60–70 内容 tag + 4 类必写词（16/16，两 seed 满分）；**避开 30–50 且无规则的半细节陷阱区**（8–11 分，还诱发伪文字/站姿错/串色）。**优先级：4 类必写词全覆盖 > tag 数量**；下限从「tag 数」改成「规则覆盖率」。
- **4 类必写词** `[实测支持]`（跨 seed 4/4）：① **结构显式**——窗/建筑/家具用具体词：`three tall window panes, thick wooden mullions, small transom panes`（只写 `window, transom` → 竖梃全丢）；② **颜色隔离**——写红饰物时锁死主服装色（`black coat, black pants`），否则红串到裙子/眼睛；③ **数量显式**——同类超一个点名：`second white paper cup on table`（只写 `disposable coffee cup` 会被手里那只吸收）；④ **体型显式**——`slim, petite` 必须写。
- **不计：**单元与比例——人数 tag、`girl`/`boy`/`other`、dataset 前缀、text/语言 tag、`Text:`、权重语法、排除项、锚点；权重内实义 tag 计一次。
- **比例自检**：tag 词/（tag 词+句子词）≈ **70%**、**65–75% 可用**（关系句默认英文，直接按词数算）。用中文关系句时不算词数比例，改判「中文关系句 ≥1 句」**；词数不冒充 token。
- **比例不是准确度保证** `[实测支持]`：三模式语义准确度相同，混写收益在杂物控制与分工，不是更准。
- **覆盖率优先于配额**：先按 §4 扫完再数，补的必须是**已存在但没写的事实**；一事实一表达（换说法不重复计、成熟复合 tag 不拆同义词）；**禁止编造**；**事实保真 > 配额**——不足时写出全部可确认事实，按需加元信息行 `#单元数: N（输入事实所限）`，**不判失败**；只有输入无任何可见信息才走失败分支：`信息不足：当前证据无法支持约50个有效单元，请补充目标细节。`
- **合理隐含 vs 编造**：该事实是否**由已给定事实必然决定**（缺它画面不成立）？必然→可写（「坐在床边」必有床）；只是常见搭配→不写（室友长相、桌上哪本书）；需额外设定→绝不写。
- **关键属性必须写死，不允许以「接受默认值」代替** `[实测支持]`：主角的 **发色 / 发型 / 服装 / 体型** 四项**必须逐项写出**；同一角色跨图**逐字复用同一组属性词**。实测：三份 prompt 都没写发色，同一角色三张图出现三种发色（淡金/深棕黑/淡金）——V5 的默认值**不是固定的，每次采样都可能变**，靠不写必然导致角色不一致。

## 7 多人与角色
- 2 人以上：`base | 角色1 | 角色2…`，空间顺序左→右；base 人数 tag 合计=角色段数；base 只放总人数/场景/镜头/全局关系/权重与排除/文字/无归属道具；角色段以 `girl`/`boy`/`other` 开头。只露被褥隆起/一缕头发/一只手臂等**不可辨身份**的痕迹→写进 base 关系句，不加人数 tag、不开角色段；能辨出独立人物才计数。
- **`|` 与角色框二选一**：`|` 是 Character Prompts 替代语法，开角色框后失效；一段一职能，不用 `|` 乱拆。`[部分支持]` `|` ≈ `characterPrompts`，无差异、无串味 → 现有写法不必改。
- **角色数**：V5 官方 **22 角色**（V4 才是 6）；MCP `characterPrompts` 上限 **6 段**是工具侧限制；超 6 人用内联 `|`（不开角色框）或拆多次。**x/y 不默认开** `[实测支持]`：生效但劣化构图 → 仅固定站位时用。
- **一致性**：跨图身份/外貌逐字复用（角色卡），只改服装/表情；V5 无 precise reference，正解先出定妆图→`img2img`（4.5 + `preciseReferences` strength≈0.5）；省钱用固定 seed + 角色卡。已核实角色用准确 tag，未知靠段顺序+外貌区分。
- **锚点**：关键互动必须有配对动作 tag：`source#X` 对 `target#X`，相互动作全员 `mutual#X`，交接 `source#giving`/`target#giving`；`#` 后只接成熟动作 tag，不留孤立锚点。**锚点不可靠** → 必须同时用关系句写清施受与接触。

## 8 排除、权重、互斥、表情
- 默认不加权，格式 `1.2::tag ::`；**数字权重不写闭合 `::` 会一直作用到结尾**；建议提权 1.15–1.4、难点上限 1.5，减权 0.6–0.9、下限 0.5；全局放 base，角色权重/锚点放角色段；新写不用 `{}`/`[]`，沿用旧串按每层 1.05 换算。`[实测支持]` 权重生效但**会被别处对该元素的同义自然语言描述压过**（纯 tag `0.1::` 能整组抹除，旁有同义句则无效）→ **用权重前先删掉别处的同义描述**；`2.0::` 加强是否有效 `[未证实]`。
- 同层互斥的镜头/视角/姿势/状态不并列；base 全局取景与角色局部朝向/注视不互斥。
- **光效/色调**：光效强度靠 tag + 权重（`backlighting`/`sidelighting`/`light_rays`）；色调 tag（`orange theme`）会染发色 `[部分支持]`，关键发色加权重。
- 表情优先成熟 tag；无可靠 tag 时写最短保守关系句；**不擅改成** `smile`/`open mouth`/`tears`。

## 9 容量与边界
- 仅面向 V5 Full：约 **1471** prompt token（画师串/风格块也计入）；Curated 约 **703**，先提醒容量减半。画面内文字：Full **750 字符**（含空格）／Curated **374 字符**，与 prompt token 分开检查。
- **默认不生成画面文字（T0 后期排字）**：正文**不写** `text`/`chinese text`/`Text:`/引号/气泡载体句；要留白写 `empty space above her head`，防随机气泡用 `-1::speech bubble ::`/`-1::text ::`；原文进「文字清单」由后期排字处理。**只有用户明确要「画面里有字」才走 T1**：那时 `Text:` 必须是段末项、同段要有 `text`+语言 tag、负权重放在 `text` 组之前；T0 下**也不要写 `text` tag**（写了模型会画字）。
- 不写画布方向/比例/分辨率；`upper body`/`full body` 等取景照常写。透明：仅确有 alpha 证据才写 `transparent background`；白底不是透明画布。dataset：`fur dataset` 仅 furry/kemono/anthro；`background dataset` 仅无人风景/静物。
- V5 专属 tag 与漫画分格仅按证据用；`complexity` 是预算。
- 超长精简：删互相复述的近义词→删未生效的抽象形容词→降级纯装饰描述→仍超容量才拆段；不牺牲事实。
- 参数默认值（B/C／出图）：V5 Full、832x1216 或 1216x832、steps 28、cfg 5.5、k_euler_ancestral、karras、effort high（`medium` 会丢弃负面词）；`ucPreset`/`qualityPreset` 不传（inherit）。

## 10 检索协议（`search_tags`）
- **怎么查**：**按 tag 前缀匹配、空格会被分词查不到**——query 写下划线形式的单个 tag 或单词前缀（`still_life` 而非 `still life`）；多词拆查。
- **何时查**：拼写不确定；无对应 tag；生僻概念；疑似假 tag；近义择一。
- **看什么**：`count`>1000→可用；<50→慎用；**完全无结果 ≠ 概念不存在**→**保留成熟写法、不静默换成另一个概念的 tag**。
- **TSF／异种**：性转有 `genderswap` 系列；其余异种娘都有 tag；附身/夺舍/魂穿/身体互换（仅 `body_switch`）/分魂/娜迦无成套 tag，改用关系句。`genderbend` 不是 tag ≠ 性转没有 tag。
- 查完只把**采纳的 tag** 写进 prompt；**没调工具不许说「已核验」**。

## 11 出图自检回路（要「直接出图」时才走）
① `estimate_cost` → ② `generate_image` 按 §9、多角色按 §7 → ③ `view_image` 看整图，糊则裁局部 → ④ **七项检查表** 0/1/2：人数与左右位置／角色属性／手部动作／遮挡与层次／构图（景别机位景深）／画面文字／串味 → ⑤ **只改错项** → ⑥ 重掷：换 seed→加权重→换写法（tag↔句）→改构图；最多 3 次 → ⑦ 沉淀成功参数。
MCP 生成**单并发串行锁**，批量串行排队，并发 `429`——不算失败、不扣费，重试。`[实测支持]` **必须显式传全部参数**；**绝不传 `syncWorkbench: true`**。`estimate_cost` 报价不可信。

**C 参数块**（不进 prompt）：
```text
---params---
model: nai-diffusion-5-full | size: 832x1216 | steps: 28 | cfg: 5.5
sampler: k_euler_ancestral | karras | ucPreset: 2 | qualityPreset: none | effort: high
style: <画风串或 inherit/none>
negative: <负面串或 inherit>
characters: <若用 characterPrompts，逐段列 prompt 与 x/y>
```

## 12 合成正例（事实已给定）
查不到的成熟写法（如 `oil painting (medium)`）保留。
```
no humans, still life, oil painting (medium), indoors, day, straight-on, wooden table, wood grain, beige cloth, book stack, green book, blue book, brown book, white vase, sunflower, daisy (flower), green leaves, petals, lavender (flower), red apple, green apple, pear, purple grapes, lemon, fig, walnut, teacup, saucer, tea, steam, teaspoon, unlit candle, brass candlestand, wax drips, unworn eyewear, pocket watch, gold chain, quill, inkwell, blank envelope, wax seal, key, seashell, green bottle, cork, wine glass, window, white curtains, beige wall, sunlight, shadow, soft lighting, blurry background The stack rests on the beige cloth with the green book at the bottom, the blue book in the middle and the brown book on top. The white vase stands on the brown book and holds the sunflowers and daisies. A red apple sits in front of the stack and hides the lower edge of the green book. A pear sits behind the stack and is partly hidden by it. A teacup of steaming tea rests on a saucer that also holds a teaspoon. The unlit candle stands in a brass candlestand with wax drips on its side. A pair of unworn glasses and a pocket watch on a gold chain lie on the table. A quill and an inkwell sit beside a blank envelope closed with a wax seal. The background shows a beige wall and a window with white curtains. Soft sunlight lights the scene and the objects cast shadows.
```
（本正例：62 个有效单元（52 tag + 10 关系句），已达本模式 ≥50 的要求；密度以此为准，勿再压缩）

## 13 禁止事项
不编造未给定事实；不编画师名、不自创 tag；**不因查不到就把成熟写法静默换成另一个概念的 tag**；不输出解释/标题/Markdown（B/C 代码块除外）；不用长 tag 加句号、不拆句插 tag、不按逗号凑数；不在 `#` 后接自然语言；**正文必须纯英文（`Text:` 载荷除外）——交付前数一遍中文，必须为 0**；**关系句必须用 `, ` 与 tag 分隔、一段只写一格**；不为凑比例加无用 tag；不混用 `|` 与角色框；不承诺效果；默认不写画师名、不写质量词、不写色彩档词、不写画面文字（这四项都是「用户明确要求才做」）；V5 会自补合理细节，要压住只能写负面或明确指定，不能靠不写。

## 14 待回填
- `[未证实]`：`2.0::` 加强；负面对画质类；权重曲线与优先级；`effort: medium`、`ucPreset` 0/1/3、cfg/steps、Curated、>2 人、每角色 `negativePrompt`。T1–T12 已回填。
- **待出图验证**：§12。
