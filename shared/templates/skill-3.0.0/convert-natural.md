# NovelAI V5 Full 文字转换｜纯自然语言

用户输入：
{{input}}

## 0 中文叙事 → 可见事实（第一步）

**转写判据：只转能画出来的。** 句子须落进「谁/什么＋在哪＋姿态＋表情或材质＋光从哪来」。

**可推出 vs 编造**：该事实是否**由已给定事实必然决定**（缺了它画面不成立）？**必然→可写**（坐在床边必有床；宿舍必有上下铺）；**只是常见搭配→不写**（室友长什么样、桌上具体哪本书）；**需额外设定才成立→绝对不写**。

| 原文类型 | 转成可见状态（禁直译） |
|---|---|
| 心理 | 禁 `she regrets`；`head_down, furrowed_brow, wavy_mouth, clenched_hands`；句 `Her fingers grip her skirt.` |
| 时间流逝 | 禁 `three days later`；`messy bed, sweat, candle`；句 `The candle burned down.` |
| 因果（被附身） | 禁 `because possessed`；`empty_eyes, no_pupils`；句 `A stranger's expression.` |
| 回忆 | 禁 `she remembered`；`inset, mirror, reflection`；句 `A small inset shows her old face.` |
| 评价与程度 | 禁 `very beautiful`；丢 |

**概念映射：先查再译，查不到用自然语言，绝不自造 tag。** 中文概念先英译→`search_tags` 核验（§8）→命中才写 tag，否则交关系句。**性转有 `genderswap` 系列；附身/夺舍/魂穿/互换无成套 tag；查不到就写自然语言关系句**。

**中文整句是复杂关系与状态的首选写法** `[实测支持]`：V5 支持中文自然语言，复杂/易失真关系优先整句中文。例：`A young man sits on the bed in the morning light.` 这具身体里住着一个女人的灵魂，她正低头看着自己陌生的手掌。

**全中文会幻觉乱码招牌** `[实测支持]`：避开招牌/菜单语义，把 `text, logo` 写进负面。

**硬规则：每个中文句须落成至少一个可见证据，落不成的直接丢。** 不整段包引号（引号＝要渲染的画面文字）。

## 1 输出契约与正文形态

- **形态 A（默认）＝正文一行＋元信息行 0–2 行**：正文必须一行完整句 prompt（主语＋限定谓语）；无解释/标题/Markdown。`#` 元信息行**不属于 prompt、复制不带**，默认不输出：`#参考原文`（要来源时）、`#单元数: N`（问够不够/自检时）。
- **形态 B（「给字段」「带角色框」「直接出图」）**：主串＋`Character N:`＋`UC:` 三段代码块（§4）。
- **形态 C（「给参数」）**：A/B 后另起 `---params---` 块（§9）。
- **Tag 规范**：成熟 Danbooru/NovelAI tag 优先，空格不用下划线；**本模式人数与身份一律用完整句写，不用 tag**（见上条 5 类例外）。**4 类必写词允许直接用描述性英文短语**（`small transom panes`、`slim, petite`），不必强求词表存在——V5 照样执行；「成熟 tag 优先」仍保留。
- **结构**：正文全为完整句，一句一个职能，不用长 tag 加句号、不复述外貌。**纯 NL 正文只允许这 5 类非句子成分**：① 多人时角色段起始词 `girl`/`boy`/`other`；② `Text:` 载荷（仅 T1，默认不用）；③ 锚点 `source#`/`target#`/`mutual#`；④ 权重语法 `1.2::…::`；⑤ **质量尾**（放整行最末）。**绝对不许** `1girl`/`solo`/`genderswap (mtf)` 这类**内容 tag**——人数与身份一律用句子写（`a single young woman whose body once belonged to a man`）。**简单输入 ≥2 句；多人每人 ≥1 句。**
- **密度两级制** `[实测支持]`（原「≥50」门槛已废：50 档 11 分＝22 档，30–50 无规则谷底 8 分）：**草稿档 ≈22 tag + 4 类必写词 → 14/16**；**终稿档 60–70 tag + 4 类必写词 → 16/16**；**避开 30–50 且无规则的「半细节陷阱区」**（8–11 分，易诱发伪文字/站姿错/串色）。优先级：**4 类必写词覆盖 > tag 数量**，下限从「tag 数」改成「规则覆盖率」。
  事实不足→把能确认的事实全部写出、不编造，**不判失败**（要自检时另起 `#单元数` 元信息行，见形态 A）。**只有**输入完全无法转成可见画面（纯抽象心理／纯对话／无任何视觉信息）时才走失败分支，只输出一行：`信息不足：当前证据无法支持约 50 个有效单元，请补充目标细节。` 禁止编造凑数。

## 2 三件套：默认全不用

- **默认不用风格提示词、不用质量提示词** `[实测支持]`：**画风头（画师串）默认不写**——不写画师名、不写风格串，**绝不自己编**；用户明确要某画风时由**用户自己**在 style 字段填，模板不代填、正文不写。**质量尾默认不写**——正文不写 `very aesthetic, masterpiece`、`best quality`、`absurdres`，`qualityPreset` 一律 `none`。只有用户明确说「要加画风串／要质量词」时才加，且写明是用户要求。
- **默认不写任何色彩档词**：不加 `monochrome / greyscale / screentones / no color`，也不加 `full color / anime coloring / cel shading / colorful`；色彩由软件风格提示词与设置决定，模板只写画面内容，**负面也不追加色彩档词**。只有用户明确要「黑白漫画」时才加 `monochrome, greyscale`。
- **`stylePrompt` / `negativePrompt` / `qualityPreset` / `ucPreset` 默认都不传（**默认不用负面提示词**）**：软件已锁定画师串与负面串（已含 `lowres, artistic error, worst quality, bad anatomy, screentone, multiple views` 等），**模板不重复写、不覆盖**；调用只传 `positivePrompt`＋采样参数（见 §9 参数块）。用户要自己管负面时才用基础串，**只删冲突项、不补词**：漫画/分格/多视图删 `multiple views, halftone, screentone`；多人删 `extra characters`；要文字删 `logo`；SFW 时最前加 `nsfw`。**negativePrompt 字段不是保险** `[实测支持]`：删不掉已被正面描述的元素；要删就改正面，或用正文负权重 `-3::`（见 §5）。

## 3 事实检索顺序

按七层顺序扫完再数：① 身份外貌（发色束法、瞳色、饰物、痣妆）② 体型（身高感、肩腰胯、四肢、肤质）③ 服装（主名词→轮廓→领型/袖型/开合/层叠→材质→工艺→穿着状态）④ 场景（空间、地面、墙面、家具、陈设）⑤ 光线（方位、明暗、色温、光源；**强度靠 tag＋权重**：`backlighting`/`sidelighting`/`light_rays`/`lens_flare`，光靠句子不够；**光色措辞** `[实测支持]`：清晨/白天写 `warm morning light`/`golden morning sunlight`，写 `cool` 会把画面拽成**夜调**，要冷调就明确按「黎明前」写）⑥ 镜头（景别、机位、景深、层次）⑦ 手与身体（哪只手、手部状态、重心、朝向）。取景之外不写。

## 4 多人与角色

- 2 人以上：`base | 角色1 | 角色2…`，按空间顺序。**模型支持 22 人（22 个不同角色）**；本机 `characterPrompts` 最多 **6 段**，超 6 人用内联 `|`（不开角色框）或拆多次生成、每张 ≤6 人。**x/y 定位不默认开** `[实测支持]`：劣化构图→仅明确要固定站位/拼版时用。
- base 只放人数、场景、镜头、全局排除/权重、文字、无归属道具、全局关系句；人数合计＝角色段数。角色段以 `girl`/`boy`/`other` 开头。交接道具连同属性只写在**当前主要控制方**段，另一方用关系句写触碰。已核实角色用准确 tag（danbooru 写法）；原创角色靠段顺序＋外貌服装区分，**不编名**。跨段一致性：身份外貌 tag 串做成角色卡**逐字复用**。

**串味处理**：写明各角色特征与持物归属；必要时用该角色 UC 栏排除对方特征。**防性别串味** `[实测支持]`：涉及性别/身份时明确每个角色性别 tag，不需要的写进该角色负面。**不可辨痕迹不计数**：被褥隆起、一缕头发、一只手臂等不可辨身份痕迹→写进 base 关系句，**不加人数 tag、不开角色段**。


**人数措辞**：「只有一人」写 `only one person is clearly visible`，**不写 `no other visible people`**——后者与「被子里的室友痕迹」矛盾；不需要就整句不写。
## 5 排除、权重、互斥、表情

- 明确排除且易误加的具体元素：在 text/语言 tag/`Text:` 前写一次 `-1::tag ::`；人数/透明/非漫画已有正向约束时不重复负权。本图负权重另起一行接在质量尾之后。
- 默认不加权，格式 `1.2::tag ::`（**数字权重不写闭合 `::` 会一直作用到 prompt 结尾**）。建议：提权 1.15–1.4、上限 1.5；减权 0.6–0.9、下限 0.5。`[实测支持]` **权重会被别处同义描述压过**→**用权重前先删掉别处同义描述，否则无效**；`2.0::` 加强 `[未证实]`。
- **正文负权重是删属性/删元素的首选，优先于 negativePrompt 字段** `[实测支持]`：**改属性 `-1::`**（`-1::red umbrella ::` 削「红」−94.5%，伞体变灰褐）；**删物体 `-3::`**（伞面消失只剩伞杆；`-2::` 无增量）；**写 base 段末、第一个 `|` 前**（压得过角色段同名正向 tag）；**前提：先删别处同义描述**；`negativePrompt` 写 `red umbrella` 删不掉→正文负权重更有效；`-4::` 未测。
- 同层互斥的镜头/视角/姿势/状态不并列（`from side` 与 `from behind`、`from below` 与 `from above` 互斥）；全局取景与角色局部朝向、回头、注视不互斥。
- **机位与头部动作互斥** `[实测支持]`：`straight-on` / `from front`（正面平视）与 `head down` / `looking at own hands`（低头看手）**不能同时写**——实测同写时 V5 一律选机位、放弃低头，人物抬头看镜头。**要低头看手，就用 `from above` / `from slightly above` / 干脆不写机位。**
- 表情优先成熟 tag；无可靠 tag 时写**最短保守关系句**。
- **一句只写一个动作；不许写互相矛盾的修饰** `[实测支持]`：一句塞两个动作（「握伞柄＋手搭桌沿」）→ V5 只执行一半、主要动作丢失。**同一道具的开合状态与位置只写一次，且前后一致。**
- **手部**：手部是 V5 最不稳定部件；`hand focus` 与手部质量**无相关性** `[实测支持]`。**靠「换手势（并拢/侧向/虚化）＋取景（远景/手出画）」规避**，不靠 `hand focus` 或负面词。

## 6 密度、必写词与比例

- **计数口径**：**有效单元＝去重且有依据的独立视觉事实**；目标密度 ≥50（非及格线），无固定 150 上限。一句可含多个清楚事实。
- **不计**：协议例外不计；同一事实换说法不重复计；一个成熟概念不拆同义事实凑数。
- **4 类必写词** `[实测支持]`（跨 seed 4/4 生效，**优先级高于 tag 数量**）：① **结构显式**——`three tall window panes, thick wooden mullions, small transom panes`（只写 `window, transom` 竖梃全丢）；② **颜色隔离**——写红色饰物时锁死主服装色（`black coat`），否则红串到裙子/眼睛；③ **数量显式**——`second white paper cup on table`（只写 `disposable coffee cup` 桌上那只消失）；④ **体型显式**——`slim, petite` 必写，否则自补夸张体型。
- **本模式不套用 70/30 比例**，也不设每人句数下限；**比例只作自检参考，不达标不构成失败**。
- **反注水**：① 覆盖率优先于配额——按 §3 扫完不足才找补，补的必须是**已存在但没写**的事实；② 一事实一表达——**补数只能补没写过的事实，同一事实的近义 tag 变体不重复计、不重复写**。
- **配额不足时的自查** `[实测支持]`：写完数一遍——**画面里还有哪些已确认的事实没写？**。**「不足 50」的正当理由是「事实就这么多」，不是「懒得写」。**

## 7 容量与模型边界

- 仅面向 V5 Full：约 **1471** 有效 prompt token（画师串与风格块也计入）。要 Curated（约 **703**）时先提醒容量减半。
- **`|` 与角色框二选一**：`|` 是 Character Prompts 的替代语法，角色框存在则失效。
- V5 专属 tag（`depthness`、`attractive male`、`low/medium/high/ultra complexity`、`has alpha`）与漫画分格**仅按明确要求使用**。画布方向/比例/分辨率交软件参数；`upper body`/`full body` 等取景 tag 照常写。
- **超长精简**：删互相复述的近义词 → 删未生效的抽象形容词 → 删可由取景 tag 涵盖的重复描述 → 次要对象降为关系句 → 仍超容量才拆段或多次生成。

## 8 检索协议（search_tags）

- **何时查**：不确定拼写/单复数、中文概念找不到英文 tag、生僻视觉概念（异种/服装部件/道具）、疑似自拼假 tag、需判断近义 tag。
- **怎么查**：`search_tags(query, limit)` 按 **tag 前缀匹配、空格会被分词**→query 写**下划线形式或单词前缀**。多词概念先英译成一个下划线复合词查一次，查不到再拆单词查一次，**两次都空才算无结果**。
- **判读**：`count` >1000 且语义吻合→可用；100–1000→配句子补强；<50→慎用。`category` 0=general、3=copyright、4=character，**c3/c4 是角色名/作品名，不能当通用概念**（`naga` 只回角色名→用 `lamia`）。
- **「查不到」≠「不存在」，不许静默换成另一个概念的 tag**：① 无成熟 tag 用自然语言描述；② 疑似未收录则保留原写法并标存疑；③ 找到语义等价的替代并说明理由。查的是 danbooru 索引，**NAI 专属 tag 查不到属正常**。只把采纳的 tag 写进 prompt。

## 9 出图自检回路与参数

① `estimate_cost` 报价（计费以 `list_history` 为准）；② `generate_image` 按下列**参数默认值**；③ `view_image` 看整图，手/脸糊裁局部；④ **七项检查表**：人数与左右位置／角色属性／手部动作／遮挡与前后层次／构图／画面文字／串味；⑤ **只改错项**，保留已命中项；⑥ **重掷顺序**：换 seed→加权重→换写法（tag↔句）→改构图，最多 3 次；⑦ 沉淀成功参数。

**一致性**：V5 无 precise reference→先出定妆图，再 `img2img`：`nai-diffusion-4-5-full`＋`preciseReferences`（strength ≈ 0.5）拉脸（+5 Anlas）。

```text
---params---
model: nai-diffusion-5-full | size: 832x1216 | steps: 28 | cfg: 5.5
sampler: k_euler_ancestral | karras | effort: high
stylePrompt / negativePrompt / qualityPreset / ucPreset: inherit（不传）
characters: <若用 characterPrompts，逐段列 prompt 与 x/y>
```

## 10 合成正例（非实际图片，勿套用凑数）

```text
An oil painting of a still life with no people, viewed straight on indoors in the daytime. A wooden table shows wood grain. A beige cloth lies on the table under a stack of three books. The green book is at the bottom with the blue book in the middle and the brown book on top. A white vase is tall and narrow and stands on the brown book, holding sunflowers and daisies with green leaves. The petals are pale pink and the lavender is deep purple. Scattered petals and a bundle of lavender lie on the table. A red apple sits in front of the stack and hides the lower edge of the green book. A pear sits behind the stack and is partly hidden by it. A green apple, purple grapes, a lemon, a fig and a walnut also lie on the table. A teacup of steaming tea rests on a saucer that also holds a teaspoon. An unlit candle with wax drips stands in a brass candlestand. A pair of unworn glasses and a pocket watch on a gold chain lie on the table. A quill lies with its nib pointing toward an inkwell. A blank envelope is closed with a wax seal and is unaddressed. The key is small and made of dark iron. The seashell is pale and finely ridged. A green bottle is stopped with a cork and is half full of dark liquid. An empty wine glass with a thin stem catches the window light. The background shows a beige wall and a window with white curtains. Soft sunlight lights the scene and the objects cast shadows. The background is blurred.
```

（本正例：51 个独立事实，已达本模式 ≥50 的要求；密度以此为准，勿再压缩）

## 11 禁止事项

不编造未给定/不可见的事实（**V5 会自行补全合理细节；要压住某类自补内容，只能写进负面或明确指定，不能靠不写**）；不自己编画师名、不自创 tag；不把中文当 tag（`Text:` 载荷除外）；不写画布方向/比例/分辨率；不把通用负面词写进正文；不重复写质量词；不堆近义词、不拆成熟复合 tag；不在 `#` 后接自然语言；不把叙事句包进引号；不声称「已核验」而没调 `search_tags`；不承诺「保证出图效果」；**默认不写画师名、不写质量词、不写色彩档词、不写画面文字**——这四项都是「用户明确要求才做」。不输出解释、标题或 Markdown。

**关键属性必须写死，不允许以「接受默认值」代替** `[实测支持]`：主角的 **发色 / 发型 / 服装 / 体型** 四项**必须逐项写出**（年龄、物种涉及时必须写）；同一角色跨图**逐字复用同一组属性词**。实测：三份 prompt 都没写发色，同一角色三张图出现**三种发色**——V5 的默认值**不是固定的，每次采样都可能变**，靠不写必然导致角色不一致。**「不写」不等于「中性」，等于「交给模型随机」。**

**V5 能力边界** `[实测支持]`：被包裹/被遮挡的人（被子里的室友）很难表达，通常只出到「被褥隆起」；重要的话改用可见痕迹（露出一缕头发/一只手臂/肩背轮廓），或干脆不写。

## 12 待回填 / 待出图验证

- **`[未证实]`**：`2.0::` 加强、负面对画质、权重 0.3–0.7 曲线、`effort: medium`、`ucPreset` 0/1/3、cfg/steps、Curated。
- **待出图**：
  1. `1girl, solo, genderswap_(mtf), sitting up, on bed, hand on own face, 这具身体里住着一个女人的灵魂，她正看着自己陌生的手掌。 very aesthetic, masterpiece, no text`

## 13 按需条款（仅当输入涉及才读）

- **dataset / 透明**：fur dataset 仅 `furry`/`kemono`/`anthro`；background dataset 仅无人风景/静物，放 base 开头。白底或透明物体 ≠ 透明画布；要透明背景才写 `transparent background`。
- **`Text:` 与 T0/T1**：**默认不生成画面文字（T0 后期排字）**——不写 `text`/`Text:`/引号/气泡载体句；留白用 `empty space above her head`，防随机气泡用 `-1::speech bubble ::`、`-1::text ::`；原文进「文字清单」后期排字。**只有用户明确要字才走 T1**：`Text:` 段末项、同段有 `text`+语言 tag、负权重放 `text` 组前；容量 Full **750** / Curated **374** 字符；手写 `Text:` 关闭「引号自动生成」；负面 `text` 压不住→删负面 `text`/`logo`。
- **多人锚点四步**：① **判施受**（找发起者/承受者；三测试：谁先动、谁的手在动、谁的状态被改变）② **选成熟配对动作 tag**（`search_tags` 核验）③ **挂锚点**（`source#X`/`target#X`；相互动作**全员** `mutual#X`；交接 `source#giving`/`target#giving`）④ **锚点不能单独承担关系**→句子写清施受与接触位置。
