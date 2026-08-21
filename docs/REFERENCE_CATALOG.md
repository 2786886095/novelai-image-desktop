# NovelAI 角色参考图库

更新时间：2026.8.21

- 在线图库：<https://2786886095.github.io/novelai-image-desktop/>
- 软件官网：<https://nai.langbai.cc/>
- 软件仓库：<https://github.com/2786886095/novelai-image-desktop>
- GitHub 资源仓库：<https://github.com/2786886095/novelai-reference-assets>

## 数据结构

`public/reference-catalog/index.json` 使用兼容的 `langbai-reference-catalog/v1` 格式。每个角色或形态只发布一张最佳合法 NovelAI 精准参考图，同时提供：

- 原始图
- 处理后的透明原图
- NovelAI 精准参考图
- 360×480 WebP 缩略图
- 简体中文、繁体中文、日语、韩语、英语名称与搜索别名
- Gitee（中国大陆优先）和 GitHub 双下载源

精准参考尺寸仅允许 `1024×1536`、`1472×1472`、`1536×1024`。构建器按角色与分类折叠重复尺寸，只保留主体占比更合适的一张。

不具备“游戏内角色图/角色立绘”双分类的数据集只发布真实存在的“角色资源”，网站和软件不会显示空分类。

## 生成与发布

```powershell
python scripts/build-reference-catalog-locales.py
python scripts/build-reference-catalog-assets.py
python scripts/publish-reference-catalog-gitee.py
```

GitHub Pages 工作流 `.github/workflows/reference-catalog-pages.yml` 发布完整静态站点和清单。精准参考和缩略图按游戏拆分到 Gitee 仓库，避免单仓库过大；完整三阶段资源由 GitHub LFS 保存。

桌面端优先从 Gitee 读取清单和精准参考，失败后回退 GitHub。软件只下载用户选择的精准参考图，并显示文件大小与实时下载进度；网站允许分别下载三个阶段文件。

为绕开 Gitee 匿名访问的大文件限制，`gitee-index.json` 只保存 10 个游戏分片入口；各分片使用 gzip+Base64 小型清单，客户端在内存中解包并合并，完整目录无需登录即可读取。
