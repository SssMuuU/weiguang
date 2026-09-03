# 微光 Windows 可用版

Windows 版本提供单文件安装程序，不依赖 `chatgpt.site`，也不需要管理员权限。运行 `outputs/微光安装程序-0.1.0.exe` 后，程序会安装到当前用户目录，并创建桌面和开始菜单快捷方式；安装完成即可直接打开微光，不需要再在应用内执行第二次“安装”。

安装版携带完整页面资源，启动后仅在本机 `127.0.0.1` 打开独立应用窗口，不向局域网或互联网提供服务。运行时无需联网，但电脑需要 Microsoft Edge 或 Google Chrome 显示界面。

`outputs/weiguang-windows-0.1.0.zip` 继续保留为备用便携版；必须完整解压后运行，不能只复制其中的 exe。`npm run windows:package` 会同时生成安装程序、便携包和各自的 SHA-256 校验文件。

## 数据与升级

- 数据只保存在 `%LOCALAPPDATA%\Weiguang\BrowserData` 的微光专用配置中；删除该目录会清空内容。
- 建议定期从“数据与安装”导出 JSON 备份，换电脑或换浏览器后再恢复。
- 重复运行新版安装程序即可升级；卸载或升级默认保留个人数据。
- “恢复示例数据”和“清空全部数据”是两个独立操作，都会在执行前确认。

## 当前边界

- Windows 版没有 iOS 本地通知和触感反馈；核心计划、习惯、待办、回顾、备份与离线功能可用。
- Windows 安装程序不携带浏览器内核；电脑需要 Edge 或 Chrome。由于没有商业代码签名证书，首次运行时 Windows 可能显示来源提醒。
- iPhone 可从 Safari 使用“分享 → 添加到主屏幕”安装同一网页版本；原生 iOS 测试版仍需在 Mac 上完成签名与 TestFlight 验收。

iOS 和浏览器版本继续使用 [微光在线版](https://weiguang-plan-habits.workspace-192140.chatgpt.site)。
