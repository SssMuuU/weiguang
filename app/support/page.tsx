import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '使用帮助｜微光',
  description: '微光安装、数据备份、离线使用与 iPhone 提醒帮助。',
  openGraph: { title: '使用帮助｜微光', description: '微光安装、备份和常见问题说明。' },
  twitter: { title: '使用帮助｜微光', description: '微光安装、备份和常见问题说明。' },
};

export default function SupportPage() {
  return <main className="info-page"><div className="info-ambient info-ambient-one" /><div className="info-ambient info-ambient-two" /><article className="info-card glass-panel"><header className="info-header"><Link className="info-brand" href="/"><span className="brand-mark">微</span><span>微光</span></Link><span className="info-kicker">使用帮助</span><h1>让每一点行动，都有地方安放</h1><p>安装、备份与常见问题</p></header><section><h2>如何安装</h2><ul><li><strong>Windows：</strong>前往 <Link href="/windows">Windows 下载页</Link> 安装桌面版。旧版只需覆盖安装一次，不用卸载；之后可在应用内检查与下载更新。</li><li><strong>iPhone 网页版：</strong>使用 Safari 打开微光，点击“分享”，再选择“添加到主屏幕”。</li><li><strong>iPhone 原生版：</strong>当前处于 TestFlight 准备阶段，正式测试邀请会在签名与真机验收后提供。</li></ul></section><section><h2>数据在哪里</h2><p>所有计划、习惯、待办和记录都保存在当前设备。不同浏览器或设备不会自动同步，也不会看到彼此的数据。</p></section><section><h2>如何备份</h2><p>点击右上角“微”，进入“数据与安装”，选择“导出备份”。换设备后在同一位置选择“恢复备份”，导入此前的 JSON 文件。</p></section><section><h2>离线与更新</h2><p>网页完整打开一次后可以离线使用。重新联网并再次打开时，微光会自动获取已发布的新版本；更新不会主动清除本机数据。</p></section><section><h2>提醒没有出现</h2><p>系统习惯提醒仅由原生 iPhone 版提供。请确认习惯没有暂停、设置了提醒时间，并在 iOS 设置中允许微光发送通知。</p></section><section><h2>仍然需要帮助</h2><p>请先导出备份并保留出现问题时的操作步骤、设备型号和系统版本。公开支持邮箱将在 TestFlight 阶段启用。</p></section><footer className="info-footer"><Link href="/privacy">查看隐私政策</Link><Link href="/">打开微光</Link><span>微光 0.1.0（1）</span></footer></article></main>;
}

