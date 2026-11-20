# 角色提示词批量填充 / Multi-character bulk filler

`public/role-bulk-filler.js` 是一个零依赖的前端增强脚本：在「角色提示词（Character Prompt）」弹窗底部追加一个 **⌁ 批量填充** 按钮，把一段文本按角色拆开，逐个写进对应角色格的「正向提示词 / 负面提示词」，并把角色格数量自动对齐到解析出的角色数（多退少补）。

漫游画多角色图时，NAI V4.5 的 `char_captions` 是按角色格逐个提交的，一格一格手填 3～5 个角色的正负提示词很费手；这个脚本就是给这一步省事的。

## 使用方法

1. 打开「生成 → 文生图 → 角色提示」，添加任意数量的角色格（脚本也会按需要自己增删）。
2. 点弹窗底部的 **⌁ 批量填充**，粘贴文本，点 **识别** 看解析结果，再点 **填充**。
3. 状态栏会显示 `已同步为 N 个角色（新增 x / 删除 y）`。

### 支持的粘贴格式

优先级从高到低：

```text
【角色1】1girl, silver hair, red eyes, ...
负面1：lowres, text, watermark, ...

【角色2】1boy, large penis, ...
负面2：lowres, text, ...
```

也认行首角色序号：

```text
角色1: 1girl, ...
角色2: 1boy, ...
```

还认空行分段（两个空行之间算一个角色）。

- 正负分框：`负面1：` / `negative 1:` 之后的内容写进该角色的「角色负面提示词」框。
- 草稿存 `localStorage["langbai-role-bulk-filler-draft"]`，刷新或重开弹窗不丢；面板里的「清空草稿」可清掉。

## 实现方式与边界

- **只走 DOM，不碰状态**：不引入 React 依赖，也不直接调用 zustand 的 `addCharCaption / updateCharCaption`，避免与受控组件、撤销栈打架。
- **依赖的 DOM 契约**（`src/App.tsx`）：

  | 用途 | 选择器 |
  |------|--------|
  | 角色列表容器 | `[data-character-list]` |
  | 单个角色行 | `div.char-row[data-character-id]` |
  | 展开/折叠 | `button.char-row-toggle[aria-expanded]`（折叠时 textarea 不挂载，填充前先展开） |
  | 正向框 | `[data-character-field="prompt"] textarea.char-prompt` |
  | 负向框 | `[data-character-field="negativePrompt"] textarea` |
  | 按钮文案 | i18n `character.add` / `character.delete` |

- **写入方式**：`setNativeValue` + `input` / `change` / `InputEvent`，让 React 受控组件收到变更。
- **数量对齐**：先补齐缺口，再从尾部点行内的「删除」删多余的（删尾不触发 id 重排），每次点击后轮询 `rows().length` 确认生效。
- **挂载时机**：弹窗未挂载时不做任何事，`MutationObserver` 等它出现；不注册全局快捷键，Esc 只关自己的面板。
- **失败可见**：删除按钮没生效时状态栏会明确报出，而不是静默失败。

## 为什么放在 `public/` 而不是改 React

- 增删角色格、正负框、展开按钮都是既有 UI，这个脚本只是「批量灌值」，改 React 需要动 `App.tsx` 里那几百行的角色编辑器，回归面更大。
- 作为静态脚本，它可以在**不重新构建**的情况下被移除或替换（删掉 `index.html` 里那行 `<script>` 即完全还原），对不想用的人零影响。

## 已验证

- Windows 桌面版 3.0.0（解包运行）：`window.__LANGBAI_ROLE_BULK_FILLER__` 为真，按钮注入成功；端到端跑通「清空 → 加两格 → 识别 → 填充」，两格的正向与负向提示词均按格落位，状态栏回 `已同步为 2 个角色`。
- 选择器在 3.0.0 的构建产物上核对：`data-character-list`、`char-row-toggle`、`char-prompt`、`data-character-field` 均存在。
- 移动端（Flutter，`mobile/`）不加载本脚本，不受影响。

## 已知限制

- 解析按「角色序号 / 空行」切分，粘贴文本里若含大段空行会被误判成角色边界；建议用 `【角色N】` 显式标记。
- 只处理角色的正向与负面提示词，不处理角色名、启用开关与自定义坐标。
- 依赖上述 DOM 契约；如果后续版本重命名这些 class 或属性，需要同步更新选择器。
