# 微光 Windows 可用版

Windows 版本是可直接解压运行的离线应用，不依赖 `chatgpt.site`，也不需要管理员权限。发布包内同时包含微光的页面资源和一个轻量启动程序；启动后仅在本机 `127.0.0.1` 打开独立应用窗口，不向局域网或互联网提供服务。

把 `outputs/weiguang-windows-0.1.0.zip` 发给其他 Windows 用户即可。对方完整解压后双击“微光.exe”，选择“从空白开始”或“先看看示例”便可使用。运行时无需联网，但电脑需要 Microsoft Edge 或 Google Chrome 显示界面。

`npm run windows:package` 会重新生成 Windows 离线包、可上传国内静态托管的 `outputs/weiguang-web-static-0.1.0.zip`，以及两个包各自的 SHA-256 校验文件。

## 数据与升级

- 数据只保存在 `%LOCALAPPDATA%\Weiguang\BrowserData` 的微光专用配置中；删除该目录会清空内容。
- 建议定期从“数据与安装”导出 JSON 备份，换电脑或换浏览器后再恢复。
- 覆盖旧版文件即可升级；数据目录不会随应用文件覆盖而删除。
- “恢复示例数据”和“清空全部数据”是两个独立操作，都会在执行前确认。

## 当前边界

- Windows 版没有 iOS 本地通知和触感反馈；核心计划、习惯、待办、回顾、备份与离线功能可用。
- Windows 分享包不携带浏览器内核；电脑需要 Edge 或 Chrome。由于没有商业代码签名证书，首次运行时 Windows 可能显示来源提醒。
- iPhone 可从 Safari 使用“分享 → 添加到主屏幕”安装同一网页版本；原生 iOS 测试版仍需在 Mac 上完成签名与 TestFlight 验收。

公开网页目前仍可从 [微光](https://weiguang-plan-habits.workspace-192140.chatgpt.site) 访问，但该域名不适合作为中国大陆的正式入口。`weiguang-web-static-0.1.0.zip` 可直接部署到阿里云 OSS、腾讯云 COS 等国内静态托管；若使用中国大陆域名，还需按服务商要求完成域名和备案配置。
