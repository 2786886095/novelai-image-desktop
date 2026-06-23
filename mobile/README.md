# NovelAI Studio — 移动端（Flutter）

桌面端 Electron 应用的 **Android / iOS 移植版**,使用 Flutter (Dart) 重写。
与桌面端共享同一个 NovelAI 官方 API,但 UI 和原生桥接层是独立实现。

> ⚠️ 这是一个**渐进式移植**。下面标 ✅ 的功能已实现并经构建验证;标 ⬜ 的在后续阶段补齐。真机行为仍需在设备上实测迭代。

## 自适应基础（当前）

- ✅ 手机 `<600dp`：生成、重绘、图库三个主入口固定在底部，其余功能收进“更多”面板
- ✅ 平板 `≥600dp`：使用完整侧边导航；`≥1180dp` 自动展开文字标签
- ✅ 统一颜色、间距、圆角、输入框、按钮与导航主题，作为桌面视觉还原的基础
- ✅ 导航使用 `IndexedStack` 保留每个功能页面的编辑状态
- ⬜ 各功能页内部的手机单栏、平板双栏/三栏布局仍需逐页重构

## Phase 1 — 核心闭环

- ✅ API Token 配置、验证、账号套餐 / Anlas 余额读取
- ✅ 文生图:模型、尺寸预设、采样器、Steps、CFG、Seed、质量标签、批量生成
- ✅ V4 / V4.5 (`v4_prompt`) 与 V3 (`sm`/`sm_dyn`) 两套 payload
- ✅ 429 / 5xx 自动重试退避
- ✅ 出图保存到 App 目录 + 系统相册,本地历史索引
- ✅ 图库浏览、查看参数、删除
- ✅ 浅色 / 深色主题(跟随系统)、底部导航的移动端布局

## 后续阶段

- ⚠️ 图生图、局部重绘、超分、Director Tools 已有初版，仍需与桌面端逐项校验请求和交互
- ✅ 重绘遮罩按原图像素尺寸导出，支持单指绘制、双指缩放/移动、撤回、清空和遮罩显隐
- ✅ 图生图、重绘、超分、Director Tools 完成后自动把结果载入工作台
- ✅ 提示词中英翻译/撤回、标准化、权重编辑和常用相关 Tag
- ✅ 灵感胶囊完整 14 类数据、子类筛选、双语标签及正/负提示词自动分流
- ✅ 历史分组与图片重命名、图片移动、当前筛选 ZIP/系统分享
- ⚠️ 文生图已支持官方报价优先、公式回退、实扣刷新和可取消前台串行队列；Android 后台服务尚未接入
- ⬜ Vibe Transfer / 参考图、多角色提示词与坐标
- ⚠️ Tag 自动补全、AI 反推、中文转标签已有初版，模板与双版本角色规则尚未完全对齐
- ⬜ 图片元数据导入还原参数
- ⬜ 完整设置项(输出目录、代理、模板等)

## 开发

```bash
cd mobile
flutter pub get
flutter run            # 连真机或模拟器
flutter analyze        # 静态检查
flutter test           # 单元测试
```

桌面端灵感胶囊数据发生变化后，同步 Android 资源：

```bash
node scripts/sync-mobile-capsules.mjs
```

## 构建

```bash
flutter build apk --release            # Android APK
flutter build ios --release --no-codesign   # iOS（无签名，仅测试/归档）
```

CI(`.github/workflows/build-mobile.yml`)会自动产出:
- **Android APK**(可直接安装)
- **未签名 IPA**(无 Apple 开发者证书,**无法直接装真机**,仅作归档 / 自行侧载)

## 目录

- `lib/models/` — 数据模型(`GenerateParams` 等,对应桌面端 `types.ts`)
- `lib/services/nai_api.dart` — NovelAI API(对应 `nai.ts`)
- `lib/services/storage.dart` — Token / 历史 / 存图(对应 `store.ts` + `storage.ts`)
- `lib/state/app_state.dart` — 状态管理(对应 `store.ts` 的 zustand)
- `lib/screens/` — 生成 / 图库 / 设置 三个页面
