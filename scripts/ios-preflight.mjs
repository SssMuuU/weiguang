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

function verifyProjectFiles() {
  const appPage = read('app/page.tsx');
  requireText(appPage, '无需注册账号；计划、习惯、待办和记录仅保存在当前设备。', '应用内隐私说明');
  requireText(appPage, '微光 0.1.0（1）', '应用内版本信息');
  requireText(appPage, '备注（可选）', '待办备注编辑');
  requireText(appPage, 'nextMilestoneCopy', '计划下一步计算');
  requireText(appPage, '相关完成记录也会一并删除', '待办删除确认');

  const privacyPolicy = read('PRIVACY_POLICY.md');
  requireText(privacyPolicy, '不包含广告、用户分析或跨应用追踪 SDK', '隐私说明');
  requireText(privacyPolicy, '不会把这些内容上传到微光服务器', '隐私说明');

  const storeMetadata = read('APP_STORE_METADATA.md');
  requireText(storeMetadata, 'com.weiguang.habits', 'App Store 发布资料');
  requireText(storeMetadata, '版本：`0.1.0`', 'App Store 发布资料');

  const project = read('ios/App/App.xcodeproj/project.pbxproj');
  requireText(project, 'MARKETING_VERSION = 0.1.0;', 'Xcode 版本设置');
  requireText(project, 'CURRENT_PROJECT_VERSION = 1;', 'Xcode 构建号');
  requireText(project, 'PRODUCT_BUNDLE_IDENTIFIER = com.weiguang.habits;', 'Bundle Identifier');
  requireText(project, 'IPHONEOS_DEPLOYMENT_TARGET = 15.0;', 'iOS 最低版本');

  const info = read('ios/App/App/Info.plist');
  requireText(info, '<string>微光</string>', 'App 显示名称');
  requireText(info, '$(MARKETING_VERSION)', 'Info.plist 版本绑定');
  requireText(info, '$(CURRENT_PROJECT_VERSION)', 'Info.plist 构建号绑定');

  const privacy = read('ios/App/App/PrivacyInfo.xcprivacy');
  requireText(privacy, '<false/>', '隐私清单追踪声明');
  requireText(privacy, 'NSPrivacyAccessedAPICategoryUserDefaults', '隐私清单');
  requireText(privacy, 'NSPrivacyAccessedAPICategoryFileTimestamp', '隐私清单');

  const swiftPackage = read('ios/App/CapApp-SPM/Package.swift');
  ['CapacitorApp', 'CapacitorFilesystem', 'CapacitorHaptics', 'CapacitorLocalNotifications', 'CapacitorPreferences', 'CapacitorShare'].forEach((plugin) => requireText(swiftPackage, plugin, '原生插件清单'));

  requireFile('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png');
  requireFile('ios/App/App/Assets.xcassets/Splash.imageset/Default@3x~universal~anyany.png');
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
