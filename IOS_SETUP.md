# 微光 iOS 构建与 TestFlight 交接

本文件记录从当前仓库得到可安装 iPhone 测试版的最短路径。日常产品范围与进度仍以 `PROJECT_PLAN.md` 为准。

当前 iOS 结构：

- Capacitor 8.5，最低支持 iOS 15。
- App 标识：`com.weiguang.habits`；显示名称：微光。
- `mobile/` 是移动端静态入口，复用网页版 React 页面与毛玻璃样式。
- `ios/` 是已生成的 Xcode 工程，使用 Swift Package Manager 管理插件。
- 数据保存在 iPhone 本机；习惯提醒为系统本地通知，不依赖服务器。
- 完成待办、习惯目标和里程碑时提供系统触感反馈。
- 已包含 `PrivacyInfo.xcprivacy`，声明 Preferences 使用的 UserDefaults 原因；未声明追踪。

## 首次在 Mac 上运行

准备 macOS、Node.js 22 或更高版本、Xcode 26 或更高版本及 Xcode Command Line Tools。仓库拉取完成后，在项目根目录依次运行：

1. `npm ci`
2. `npm run ios:sync`
3. `npm run ios:open`

Xcode 打开后选择 `App` target，在 Signing & Capabilities 中选择自己的 Apple Developer Team。确认 Bundle Identifier 可用，然后选择模拟器或已配对的 iPhone，点击运行。

每次修改 React 页面后，只需重新执行 `npm run ios:sync`，再回到 Xcode 运行。不要直接编辑 `ios/App/App/public`，它会在同步时由 `mobile-dist` 覆盖。

## 真机验收清单

- 首次启动可看到微光玻璃光球启动页，随后进入“今天”。
- 关闭网络后重新打开，计划、习惯、待办和历史记录仍可读取与修改。
- 完成待办、习惯目标和计划里程碑时有轻量触感。
- 为习惯设置提醒时间后出现通知授权；允许后，通知按所选星期触发。
- 暂停习惯或清空提醒时间后，相关待处理通知被取消。
- 刘海屏与 Home Indicator 区域无遮挡，横竖屏均无横向溢出。
- 导出 JSON 备份后能通过“恢复备份”重新导入。

## TestFlight

真机清单通过后，在 Xcode 中完成以下事项：

1. 将 Version 设为 `0.1.0`、Build 设为 `1`，后续每次上传递增 Build。
2. 连接 App Store Connect 中对应的 App 记录，确认 Bundle Identifier 为 `com.weiguang.habits`。
3. 选择 `Any iOS Device (arm64)`，执行 Product → Archive。
4. 在 Organizer 中运行 Validate App；无阻塞问题后选择 Distribute App → App Store Connect → Upload。
5. 等待构建处理完成，补齐测试说明并添加内部测试员。

正式外部测试前还需准备 App Store 隐私信息、支持链接、隐私政策和商店截图。当前版本不创建账号、不采集分析数据、不进行用户追踪，产品数据仅在设备本地和用户主动导出的备份中保存；网页版私有云数据不会自动进入 iOS App。

参考：[Capacitor 环境要求](https://capacitorjs.com/docs/getting-started/environment-setup)、[iOS 工程说明](https://capacitorjs.com/docs/ios)、[本地通知](https://capacitorjs.com/docs/apis/local-notifications)、[触感反馈](https://capacitorjs.com/docs/apis/haptics)。
