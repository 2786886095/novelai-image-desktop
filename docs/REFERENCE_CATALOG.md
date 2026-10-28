# NovelAI 角色参考图库

更新时间：2026.8.21

- 在线图库：<https://2786886095.github.io/novelai-image-desktop/>
- 软件仓库：<https://github.com/OldLi1337/novelai-image-desktop>
- GitHub 资源仓库：<https://github.com/2786886095/novelai-reference-assets>

在线图库与资源仓库由上游项目构建和托管；本仓库不发布图库站点，也不维护 Gitee 镜像。

## 数据结构

`public/reference-catalog/index.json` 使用兼容的 `langbai-reference-catalog/v1` 格式。每个角色或形态只发布一张最佳合法 NovelAI 精准参考图，同时提供：

- 原始图
- 处理后的透明原图
- NovelAI 精准参考图
- 360×480 WebP 缩略图
- 简体中文、繁体中文、日语、韩语、英语名称与搜索别名
- GitHub 下载源（清单中保留的 Gitee 镜像地址已停用，软件不会读取）

精准参考尺寸仅允许 `1024×1536`、`1472×1472`、`1536×1024`。构建器按角色与分类折叠重复尺寸，只保留主体占比更合适的一张。

不具备“游戏内角色图/角色立绘”双分类的数据集只发布真实存在的“角色资源”，网站和软件不会显示空分类。

## 生成与读取

```powershell
python scripts/build-reference-catalog-locales.py
python scripts/build-reference-catalog-assets.py
```

`build-reference-catalog-assets.py` 需要原始图片目录与上游资源仓库的本地副本，用于重新生成随软件打包的 `public/reference-catalog/index.json`；完整三阶段资源由 GitHub LFS 保存。同目录的 `gitee-index.json` 是构建脚本为已停用的 Gitee 镜像写出的分片入口，软件不读取。

桌面端依次读取上游 GitHub Pages 上的清单、资源仓库中的 `catalog/index.json`，都不可用时使用随软件打包的清单。软件只从 GitHub 下载用户选择的精准参考图，并显示文件大小与实时下载进度；网站允许分别下载三个阶段文件。
