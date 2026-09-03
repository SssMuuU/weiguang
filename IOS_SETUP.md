# 微光 iOS 构建与 TestFlight 交接

本文件记录从当前仓库得到可安装 iPhone 测试版的最短路径。日常产品范围与进度仍以 `PROJECT_PLAN.md` 为准。

当前 iOS 结构：

- Capacitor 8.5，最低支持 iOS 15。
- App 标识：`com.weiguang.habits`；显示名称：微光。
- 当前测试版版本：`0.1.0 (1)`，已与 npm 包及 Xcode Debug/Release 配置统一。
- `mobile/` 是移动端静态入口，复用网页版 React 页面与毛玻璃样式。
- `ios/` 是已生成的 Xcode 工程，使用 Swift Package Manager 管理插件。
- 数据保存在 iPhone 本机；习惯提醒为系统本地通知，不依赖服务器。
- App 无需注册账号；网页版也改为本机保存，旧版无身份 D1 接口已停用，避免共用快照被读取或覆盖。
- 应用从后台重新激活时会自动刷新当天日期；启动、恢复备份或重置数据后会在已有授权下校准提醒，不会在启动时主动索要通知权限。
- 完成待办、习惯目标和里程碑时提供系统触感反馈。
- JSON 备份使用系统分享面板，可保存到“文件”、AirDrop 或其他应用。
- 计划支持截止日期、逾期提示、归档和恢复；旧版数据会自动迁移到 v4。
- 已包含 `PrivacyInfo.xcprivacy`，声明 Preferences 的 UserDefaults 与备份文件时间戳使用原因；未声明追踪。
- `Info.plist` 已声明仅支持 `arm64`，并将 `ITSAppUsesNonExemptEncryption` 设为 `false`；当前代码不实现自有加密算法，仅使用系统提供的安全能力。
- 应用内“数据与安装”已提供隐私与版本说明；`PRIVACY_POLICY.md` 和 `APP_STORE_METADATA.md` 保存隐私政策与商店资料草案。

## 从 Windows 生成 Mac 交接包

在项目根目录运行 `npm run ios:handoff`。命令会先执行完整 iOS 预检，确认工作区没有未提交改动，再从当前 Git 提交生成 `outputs/weiguang-ios-0.1.0-build1-source.zip` 和对应的 SHA-256 校验文件。压缩包不包含依赖缓存，但包含 iOS 工程、应用源码、锁文件、图标、启动页、隐私资料和本交接说明。

把 ZIP 复制到 Mac 后解压，再按下节运行 `npm ci`、`npm run ios:preflight` 和 `npm run ios:open`。如需确认文件在传输中未损坏，可在 Mac 终端运行 `shasum -a 256 weiguang-ios-0.1.0-build1-source.zip`，与校验文件中的值比较。

## 首次在 Mac 上运行

准备 macOS、Node.js 22 或更高版本、Xcode 26 或更高版本及 Xcode Command Line Tools。仓库拉取完成后，在项目根目录依次运行：

1. `npm ci`
2. `npm run ios:preflight`
3. `npm run ios:open`

预检会重新生成移动端资源，核对版本号、Bundle Identifier、64 位设备能力、加密出口声明、原生插件、图标、启动页、隐私清单、应用内隐私文案和 App Store 发布资料；在 macOS 上还会执行一次无需签名的模拟器编译。Xcode 打开后选择 `App` target，在 Signing & Capabilities 中选择自己的 Apple Developer Team。确认 Bundle Identifier 可用，然后选择模拟器或已配对的 iPhone，点击运行。

每次修改 React 页面后，只需重新执行 `npm run ios:sync`，再回到 Xcode 运行。不要直接编辑 `ios/App/App/public`，它会在同步时由 `mobile-dist` 覆盖。

## 真机验收清单

- 全新安装首次启动可看到微光玻璃光球启动页和无登录引导；选择“从空白开始”后，今天、计划和习惯均为空。
- 删除 App 后重装，选择“先看看示例”可载入演示内容；已有本机数据的升级安装不会再次显示引导。
- 关闭网络后重新打开，计划、习惯、待办和历史记录仍可读取与修改。
- 浏览器版首次完整打开后断网刷新，页面样式和脚本仍能加载；缺失的非导航资源不会收到错误的 HTML 回退。
- 点击待办名称可编辑标题、备注、日期和关联计划；已完成待办改期后仍保持完成状态。
- 打开计划详情后可修改名称、分类和截止日期；关联待办、里程碑及归档状态保持不变。
- 计划卡片和详情中的“下一步”始终指向第一个未完成里程碑；新增、完成或删除里程碑后立即变化。
- 删除待办或里程碑时会先出现确认提示，取消后原数据保持不变。
- 完成待办、习惯目标和计划里程碑时有轻量触感。
- 为习惯设置提醒时间后出现通知授权；允许后，通知按所选星期触发。
- 暂停习惯或清空提醒时间后，相关待处理通知被取消。
- 修改习惯名称、图标字和单位后，各页面及后续提醒同步更新；删除习惯后，其历史记录和待处理提醒均被清理。
- 将应用留在后台跨过午夜再打开，“今天”、问候语和回顾日期应自动更新；若正在查看历史日期，则保持当前查看位置。
- 修改习惯后退出再启动，或导入备份后，系统待处理提醒应与当前习惯周期一致。
- 在“今天”切换到历史日期，可用“－ / ＋”补记或撤销习惯次数；切到未来日期时按钮不可操作。
- 刘海屏与 Home Indicator 区域无遮挡，横竖屏均无横向溢出。
- 导出 JSON 备份后能通过“恢复备份”重新导入。
- 使用外接键盘打开首次引导、数据管理及编辑弹窗，Tab / Shift+Tab 不会进入背景页面；普通弹窗可用 Esc 关闭并把焦点还给原入口，首次引导必须明确选择开始方式。

## TestFlight

真机清单通过后，在 Xcode 中完成以下事项：

1. 确认 Version 为 `0.1.0`、Build 为 `1`；当前工程已设置完成，后续每次上传递增 Build。
2. 连接 App Store Connect 中对应的 App 记录，确认 Bundle Identifier 为 `com.weiguang.habits`。
3. 选择 `Any iOS Device (arm64)`，执行 Product → Archive。
4. 在 Organizer 中运行 Validate App；无阻塞问题后选择 Distribute App → App Store Connect → Upload。
5. 等待构建处理完成，补齐测试说明并添加内部测试员。

正式外部测试前还需把 `APP_STORE_METADATA.md` 中的支持邮箱、支持网址和隐私政策网址补齐，并准备商店截图。当前版本不创建账号、不采集分析数据、不进行用户追踪，产品数据仅在设备本地和用户主动导出的备份中保存。

参考：[Capacitor 环境要求](https://capacitorjs.com/docs/getting-started/environment-setup)、[iOS 工程说明](https://capacitorjs.com/docs/ios)、[应用生命周期](https://capacitorjs.com/docs/apis/app)、[本地通知](https://capacitorjs.com/docs/apis/local-notifications)、[触感反馈](https://capacitorjs.com/docs/apis/haptics)。
