# 微光 Windows 版

当前发布方式为 Windows 标准 MSI 安装包。0.2.0 的自制 EXE 安装器因 Defender 告警停用，不应恢复隔离文件或绕过防护。0.2.1 移除了自制安装、文件替换、卸载助手，由 Windows Installer 负责这些操作。

关闭旧版，运行新版 MSI，确认原安装位置后覆盖安装，不必卸载。安装器会读取已登记的安装目录；默认位置为 %LOCALAPPDATA%\\Programs\\微光，完成时可勾选“打开微光”。日常核心功能继续离线运行。

个人数据仍位于 %LOCALAPPDATA%\\Weiguang\\BrowserData，本机页面仍为 http://127.0.0.1:17895/。安装器不管理或清理个人数据目录。升级前建议从应用中导出 JSON 备份。

应用启动时检查 latest-msi.json，有新版时确认下载，通过大小、SHA-256、MSI 产品身份、升级标识及版本校验后，打开 Windows 安装向导。安装过程中应用关闭，完成时勾选打开即可重启。若取消，旧版可手动重新打开。旧 EXE 的 latest.json 通道保持停用，不再下发可执行安装器。

发布流程：

1. 修改 windows/WindowsRelease.cs 和 windows/RELEASE_NOTES.txt。
2. WiX 3.14.1 工具仅从官方 GitHub wix3141rtm 获取；原始压缩包 SHA-256 为 6ac824e1642d6f7277d0ed7ea09411a508f6116ba6fae0aa5f2c7daa2ff43d31，放入 work/wix-3.14.1，解压到 bin。此版本兼容现有 .NET Framework 构建环境。
3. npm run windows:package 执行单元测试、构建离线包、WiX 校验、Defender 扫描、独立 MSI 安装/升级/回退/拒绝降级/卸载测试，以及原生 MSI 身份校验。病毒库须在两天内更新且实时防护开启，任何失败都不能生成公开更新清单。
4. 发布生成的 public/windows/latest-msi.json 与对应 MSI，保留旧 EXE 通道的停用信息。网站构建不得含已撤回的 EXE。
5. 发布后运行 scripts/windows-update-test.ps1 -LiveManifest public/windows/latest-msi.json，用应用同一下载代码验证线上清单和 MSI。只发布网页不等于发布 Windows 更新。

安全扫描记录保存在 outputs/windows-security-版本.json，仅记录当次引擎和病毒库下的扫描结果，不是安全保证或微软对旧告警的误报认定。仍没有商业代码签名证书，若再次出现病毒告警，应停止使用并复核，不能关闭防护或设置白名单。MSI 系统回退也可能受磁盘故障、权限、强制终止等影响，定期备份仍有必要。

Windows 功能与稳定性优先；iOS 保留工程，暂缓推进。
