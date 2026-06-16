# NovelAI Studio — 移动端（Flutter）

桌面端 Electron 应用的 **Android / iOS 移植版**,使用 Flutter (Dart) 重写。
与桌面端共享同一个 NovelAI 官方 API,但 UI 和原生桥接层是独立实现。

> ⚠️ 这是一个**渐进式移植**。下面标 ✅ 的功能已实现并经构建验证;标 ⬜ 的在后续阶段补齐。真机行为仍需在设备上实测迭代。

## Phase 1 — 核心闭环（当前）

- ✅ API Token 配置、验证、账号套餐 / Anlas 余额读取
- ✅ 文生图:模型、尺寸预设、采样器、Steps、CFG、Seed、质量标签、批量生成
- ✅ V4 / V4.5 (`v4_prompt`) 与 V3 (`sm`/`sm_dyn`) 两套 payload
- ✅ 429 / 5xx 自动重试退避
- ✅ 出图保存到 App 目录 + 系统相册,本地历史索引
- ✅ 图库浏览、查看参数、删除
- ✅ 浅色 / 深色主题(跟随系统)、底部导航的移动端布局

## 后续阶段（未实现）

- ⬜ 图生图、局部重绘、超分、Director Tools
- ⬜ Vibe Transfer / 参考图、多角色提示词与坐标
- ⬜ Tag 自动补全、AI 反推、中文转标签
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
