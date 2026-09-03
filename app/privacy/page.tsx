import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '隐私政策｜微光',
  description: '微光如何在本机保存计划、习惯、待办与完成记录。',
  openGraph: { title: '隐私政策｜微光', description: '微光采用本机优先设计，无账号、无广告、不追踪。' },
  twitter: { title: '隐私政策｜微光', description: '微光采用本机优先设计，无账号、无广告、不追踪。' },
};

export default function PrivacyPage() {
  return <main className="info-page"><div className="info-ambient info-ambient-one" /><div className="info-ambient info-ambient-two" /><article className="info-card glass-panel"><header className="info-header"><Link className="info-brand" href="/"><span className="brand-mark">微</span><span>微光</span></Link><span className="info-kicker">隐私政策</span><h1>你的记录，只属于你</h1><p>生效日期：2026 年 9 月 3 日</p></header><section><h2>本机保存</h2><p>微光无需注册账号。iPhone App 使用系统本机存储，网页与 Windows 安装版使用当前浏览器的本地存储，保存计划、习惯、待办、完成记录和应用设置。微光不会把这些内容上传到自己的服务器。</p></section><section><h2>权限与系统能力</h2><ul><li>只有在你为习惯设置提醒后，原生 iPhone App 才会请求通知权限；提醒由 iOS 在设备本地处理。</li><li>导出备份时，App 会创建临时 JSON 文件并打开系统分享面板，文件只会发送到你主动选择的位置或应用。</li><li>微光不请求通讯录、照片、定位、麦克风、相机或健康数据权限。</li></ul></section><section><h2>不收集、不追踪</h2><p>当前版本不包含广告、用户分析或跨应用追踪 SDK，不出售或共享个人数据，也不创建广告画像。</p></section><section><h2>备份与删除</h2><p>卸载 App、清除浏览器站点数据或更换设备可能导致本机数据丢失。你可以在“数据与安装”中导出、恢复或清空全部数据，建议定期保存 JSON 备份。</p></section><section><h2>政策变更</h2><p>如果未来加入账号、多设备同步或新的系统能力，本政策会在相关功能启用前更新，并说明数据用途和控制方式。</p></section><footer className="info-footer"><Link href="/support">获取帮助</Link><Link href="/">返回微光</Link><span>微光 0.1.0（1）</span></footer></article></main>;
}

