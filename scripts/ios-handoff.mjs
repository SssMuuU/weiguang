import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const root = resolve(import.meta.dirname, '..');
const outputDir = join(root, 'outputs');
const isWindows = process.platform === 'win32';
const npmCli = process.env.npm_execpath;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', stdio: options.capture ? 'pipe' : 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} 执行失败${result.stderr ? `：${result.stderr.trim()}` : ''}`);
  return result.stdout?.trim() || '';
}

function runNpm(args) {
  if (npmCli) run(process.execPath, [npmCli, ...args]);
  else run(isWindows ? 'npm.cmd' : 'npm', args);
}

try {
  runNpm(['run', 'ios:preflight']);

  const dirty = run('git', ['status', '--porcelain'], { capture: true });
  if (dirty) throw new Error('工作区存在未提交改动，请先提交后再生成交接包。');

  const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const project = readFileSync(join(root, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8');
  const build = project.match(/CURRENT_PROJECT_VERSION = (\d+);/)?.[1];
  if (!build) throw new Error('无法从 Xcode 工程读取构建号。');

  const basename = `weiguang-ios-${packageJson.version}-build${build}-source`;
  const archive = join(outputDir, `${basename}.zip`);
  const checksum = join(outputDir, `${basename}.sha256.txt`);
  mkdirSync(outputDir, { recursive: true });
  run('git', ['archive', '--format=zip', `--output=${archive}`, 'HEAD']);

  const digest = createHash('sha256').update(readFileSync(archive)).digest('hex');
  writeFileSync(checksum, `${digest}  ${basename}.zip\n`, 'utf8');
  console.log(`iOS Mac 交接包已生成：${archive}`);
  console.log(`SHA-256：${digest}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
