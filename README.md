# 微光

一个用于管理待办、计划和习惯的应用。支持每日、每周累计、间隔天数和指定星期的习惯安排，以及进度记录与回顾。

[在线使用微光](https://weiguang-plan-habits.workspace-192140.chatgpt.site)

数据保存在当前设备；可在应用的数据管理中导出和导入备份。当前版本不提供云同步。

## 本地开发

需要 Node.js 22.13.0 或更新版本。首次运行 `npm ci` 安装锁定依赖，然后运行 `npm run dev`，访问终端显示的本地网址。

常用命令：

- `npm test`：单元测试。
- `npm run lint`：代码规范检查。
- `npm run build`：构建 Sites 网站。
- `npx --no-install tsc --noEmit`：类型检查。
- `npm run mobile:build`：构建移动端与桌面端共享界面，不生成安装包。

Windows 和 iOS 打包请分别查看 [WINDOWS_SETUP.md](WINDOWS_SETUP.md) 和 [IOS_SETUP.md](IOS_SETUP.md)。

## 检查与发布

GitHub Actions 在推送到 `main` 或向 `main` 提交拉取请求时运行测试、代码规范检查、网站构建、类型检查和移动端界面构建，也可在 Actions 页面手动启动。

自动检查不更新线上网站。网站继续使用现有 Sites 地址；检查通过且用户授权发布后，由 Codex 的 GPT-5.6 Luna 低思考代理执行 Sites 发布并确认最终状态。该检查流程不需要 GitHub 仓库 Secrets，也不包含 Sites 发布凭据。

`.openai/hosting.json` 是现有微光网站的项目配置。其他人如需部署自己的副本，应使用自己的托管项目配置。

请勿提交 `.env`、访问令牌、个人备份、运行日志或本地构建缓存。
