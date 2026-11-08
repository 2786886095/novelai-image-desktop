# Linux desktop support / Linux 桌面支持

- The desktop AppImage targets **Ubuntu 24.04 LTS** on **x86_64**. This is the support and acceptance baseline, not a claim that every release passed runtime validation.
- **Ubuntu 26.04** is currently unsupported: the Sharp/Electron image runtime was observed to stall (卡住). Other distributions have not been validated.
- Linux 主机身份、原生功能、最终打包运行须分别校验。实际通过情况看当前发行的同源证据；仅识别 runner 或通过打包不能替代实机验收。
- 正式全量验收的 187 项必验范围由项目发布契约维护。旧版验收细节保留在 [v2.6.8 历史发行说明](./history/RELEASE_NOTES-2.6.8.md)，不要求每次发版重复抄写支持声明。
