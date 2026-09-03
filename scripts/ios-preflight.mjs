import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const root = resolve(import.meta.dirname, '..');
const isWindows = process.platform === 'win32';
const npmCli = process.env.npm_execpath;

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} 执行失败`);
}

function runNpm(args) {
  if (npmCli) run(process.execPath, [npmCli, ...args]);
  else run(isWindows ? 'npm.cmd' : 'npm', args);
}

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

function requireText(content, expected, label) {
  if (!content.includes(expected)) throw new Error(`${label} 缺少：${expected}`);
}

function requireFile(relativePath) {
  readFileSync(join(root, relativePath));
}

function requirePng(relativePath, width, height, noAlpha = false) {
  const image = readFileSync(join(root, relativePath));
  const signature = image.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') throw new Error(`${relativePath} 不是有效 PNG`);
  const actualWidth = image.readUInt32BE(16);
  const actualHeight = image.readUInt32BE(20);
  const colorType = image[25];
  if (actualWidth !== width || actualHeight !== height) throw new Error(`${relativePath} 尺寸必须为 ${width} × ${height}，当前为 ${actualWidth} × ${actualHeight}`);
  if (noAlpha && (colorType === 4 || colorType === 6)) throw new Error(`${relativePath} 不得包含透明通道`);
}

function verifyProjectFiles() {
  const appLayout = read('app/layout.tsx');
  requireText(appLayout, "title: '微光'", '应用名称');
  requireText(appLayout, "'apple-mobile-web-app-capable': 'yes'", 'iPhone Safari 主屏应用声明');

  const appPage = read('app/page.tsx');
  requireText(appPage, '无需注册账号；计划、习惯、待办和记录仅保存在当前设备。', '应用内隐私说明');
  requireText(appPage, '微光 0.1.0（1）', '应用内版本信息');
  requireText(appPage, '备注（可选）', '待办备注编辑');
  requireText(appPage, 'nextMilestoneCopy', '计划下一步计算');
  requireText(appPage, '相关完成记录也会一并删除', '待办删除确认');
  requireText(appPage, 'deleteSelectedPlan', '计划删除操作');
  requireText(appPage, '关联待办会保留', '计划删除数据保护说明');
  requireText(appPage, '从空白开始', '首次启动引导');
  requireText(appPage, 'createEmptySnapshot', '空白初始数据');
  requireText(appPage, '恢复示例数据', '独立恢复示例数据操作');
  requireText(appPage, '清空全部数据', '独立清空数据操作');
  requireText(appPage, 'CACHE_ASSETS', 'PWA 首屏资源缓存');
  requireText(appPage, 'handleDialogKey', '弹窗键盘焦点管理');
  requireText(appPage, '打开微光信息', '顶部信息入口');

  const appStyles = read('app/globals.css');
  requireText(appStyles, 'button:focus-visible', '键盘焦点样式');

  const serviceWorker = read('public/sw.js');
  requireText(serviceWorker, "const CACHE = 'weiguang-v6'", 'PWA 缓存版本');
  requireText(serviceWorker, "request.mode === 'navigate'", 'PWA 离线导航回退');
  requireText(serviceWorker, 'Offline resource unavailable', 'PWA 缺失资源响应');

  const manifest = read('public/manifest.webmanifest');
  requireText(manifest, '"name": "微光"', 'PWA 应用名称');
  requireText(manifest, '"src": "/icon-1024.png"', 'PWA 应用图标');
  requireText(manifest, '"sizes": "1024x1024"', 'PWA 应用图标尺寸声明');
  requirePng('public/icon-1024.png', 1024, 1024, true);

  const privacyPolicy = read('PRIVACY_POLICY.md');
  requireText(privacyPolicy, '不包含广告、用户分析或跨应用追踪 SDK', '隐私说明');
  requireText(privacyPolicy, '不会把这些内容上传到微光服务器', '隐私说明');
  requireText(privacyPolicy, 'chatgpt.site/privacy', '公开隐私政策地址');
  requireFile('app/privacy/page.tsx');
  requireFile('app/support/page.tsx');

  const storeMetadata = read('APP_STORE_METADATA.md');
  requireText(storeMetadata, 'com.weiguang.habits', 'App Store 发布资料');
  requireText(storeMetadata, '版本：`0.1.0`', 'App Store 发布资料');
  requireText(storeMetadata, 'chatgpt.site/support', 'App Store 支持网址');
  requireText(storeMetadata, 'chatgpt.site/privacy', 'App Store 隐私政策网址');

  const project = read('ios/App/App.xcodeproj/project.pbxproj');
  requireText(project, 'developmentRegion = "zh-Hans";', 'Xcode 默认语言');
  requireText(project, 'MARKETING_VERSION = 0.1.0;', 'Xcode 版本设置');
  requireText(project, 'CURRENT_PROJECT_VERSION = 1;', 'Xcode 构建号');
  requireText(project, 'PRODUCT_BUNDLE_IDENTIFIER = com.weiguang.habits;', 'Bundle Identifier');
  requireText(project, 'IPHONEOS_DEPLOYMENT_TARGET = 15.0;', 'iOS 最低版本');
  const phoneTargets = project.match(/TARGETED_DEVICE_FAMILY = 1;/g) || [];
  if (phoneTargets.length !== 2 || project.includes('TARGETED_DEVICE_FAMILY = "1,2";')) throw new Error('Xcode Debug/Release 必须保持 iPhone-only，避免首版产生未验收的 iPad 发布要求。');

  const info = read('ios/App/App/Info.plist');
  requireText(info, '<string>微光</string>', 'App 显示名称');
  requireText(info, '<key>CFBundleLocalizations</key>', 'App 本地化声明');
  requireText(info, '<string>zh-Hans</string>', 'App 简体中文语言声明');
  requireText(info, '$(MARKETING_VERSION)', 'Info.plist 版本绑定');
  requireText(info, '$(CURRENT_PROJECT_VERSION)', 'Info.plist 构建号绑定');
  requireText(info, '<key>ITSAppUsesNonExemptEncryption</key>', 'App Store 加密出口声明');
  requireText(info, '<string>arm64</string>', 'iOS 64 位设备能力');

  const privacy = read('ios/App/App/PrivacyInfo.xcprivacy');
  requireText(privacy, '<false/>', '隐私清单追踪声明');
  requireText(privacy, 'NSPrivacyAccessedAPICategoryUserDefaults', '隐私清单');
  requireText(privacy, 'NSPrivacyAccessedAPICategoryFileTimestamp', '隐私清单');

  const swiftPackage = read('ios/App/CapApp-SPM/Package.swift');
  ['CapacitorApp', 'CapacitorFilesystem', 'CapacitorHaptics', 'CapacitorLocalNotifications', 'CapacitorPreferences', 'CapacitorShare'].forEach((plugin) => requireText(swiftPackage, plugin, '原生插件清单'));

  requirePng('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', 1024, 1024, true);
  requirePng('ios/App/App/Assets.xcassets/Splash.imageset/Default@3x~universal~anyany.png', 2732, 2732, true);
  requireFile('ios/App/App/public/index.html');
}

function buildOnMac() {
  if (process.platform !== 'darwin') {
    console.log('当前不是 macOS：已完成全部跨平台检查，跳过 Xcode 模拟器编译。');
    return;
  }
  run('plutil', ['-lint', 'ios/App/App/Info.plist', 'ios/App/App/PrivacyInfo.xcprivacy']);
  const derivedData = mkdtempSync(join(tmpdir(), 'weiguang-ios-'));
  try {
    run('xcodebuild', [
      '-project', 'ios/App/App.xcodeproj',
      '-scheme', 'App',
      '-configuration', 'Debug',
      '-destination', 'generic/platform=iOS Simulator',
      '-derivedDataPath', derivedData,
      'CODE_SIGNING_ALLOWED=NO',
      'build',
    ]);
  } finally {
    const safeRoot = resolve(tmpdir());
    const safeTarget = resolve(derivedData);
    if (safeTarget.startsWith(`${safeRoot}${process.platform === 'win32' ? '\\' : '/'}`)) rmSync(safeTarget, { recursive: true, force: true });
  }
}

try {
  runNpm(['test']);
  runNpm(['run', 'lint']);
  run(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '--noEmit']);
  runNpm(['run', 'ios:sync']);
  verifyProjectFiles();
  buildOnMac();
  console.log('微光 iOS 预检通过：0.1.0 (1) 已准备好进入 Xcode 真机验收。');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
