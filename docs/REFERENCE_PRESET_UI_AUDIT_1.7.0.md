# 参考图快捷预设 UI 审计（v1.7.0）

审计范围：桌面端独立预设页、移动端独立入口、预设创建、分组筛选、创建分组、将现有预设移动到分组、预设复用与导入导出。

## 审计步骤

1. **进入预设库 — 健康**
   - 桌面端入口与顶部主功能并列；移动端使用独立底部入口。
   - 首屏直接展示预设数、分组数和当前分组，没有把主要操作藏入二级菜单。
2. **创建预设 — 健康**
   - 桌面端左侧固定创建区，图片、类型、名称、分组与参数按操作顺序排列。
   - 移动端以“新建参考图预设”进入单一滚动表单，紧凑屏幕无溢出。
3. **创建并选中分组 — 健康**
   - 当前分组与新建分组放在同一区域；新建成功后自动选中该分组。
   - 后续新建预设默认加入当前分组，避免重复选择。
4. **移动已有预设 — 健康**
   - 桌面卡片直接提供“移动到分组”下拉框。
   - 移动端卡片提供明确的“移动到分组”操作，并持久化到本地预设库。
5. **浏览与复用 — 健康**
   - 类型筛选与分组筛选互不冲突；卡片显示图片、名称、分组、类型和主要强度参数。
   - 图片统一使用完整图适配，不拉伸、不强制裁切主体。
6. **明暗主题与多语言 — 健康**
   - 桌面浅色、桌面深色均完成离屏截图复验。
   - Android 与 iOS 共 44 张截图覆盖 5 种语言、明暗主题、手机竖屏、手机横屏、平板横屏与平板竖屏。

## 可见风险与限制

- 截图可以证明布局、文本可见性、主题对比度和主要控件没有漂移或重叠；无法仅凭截图证明屏幕阅读器朗读顺序与所有键盘焦点路径。
- 分组创建、移动和持久化另有自动化测试覆盖；真实文件选择器与系统分享面板需要在各平台真机上做发布前冒烟测试。

## 截图证据

- `docs/assets/reference-preset-audit/v1.7.0-redesign/desktop/light/reference-presets.png`
- `docs/assets/reference-preset-audit/v1.7.0-redesign/desktop/dark/reference-presets.png`
- `docs/assets/reference-preset-audit/v1.7.0-redesign/mobile/`（Android/iOS 共 44 张）

## 自动化验证

- `npm run build`
- `npm run typecheck`
- `npm test -- electron/ipc/reference-presets.test.ts`
- `flutter analyze`
- `flutter test test/reference_preset_test.dart`
- `flutter test test/screen_layout_test.dart --plain-name reference`
