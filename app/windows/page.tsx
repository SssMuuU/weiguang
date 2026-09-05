import Link from 'next/link';
import release from '@/public/windows/latest.json';

export default function WindowsDownload() {
  return <main className="info-page"><article className="info-card glass-panel">
    <header className="info-header">
      <Link className="info-brand" href="/"><span className="brand-mark">微</span><span>微光</span></Link>
      <span className="info-kicker">Windows 桌面版</span>
      <h1>之后更新，不必重新安装</h1>
      <p>当前版本 {release.version} · 适用于 Windows 10 / 11（64 位）</p>
    </header>
    <section>
      <a className="submit-button" href={release.url} download>下载 Windows 安装程序</a>
      <p>已安装旧版？先关闭微光，运行此安装程序并选择原安装位置覆盖安装一次，<strong>不需要卸载</strong>。个人记录会保留，建议升级前导出一份备份。</p>
    </section>
    <section><h2>之后如何更新</h2><p>打开微光后会后台检查新版，窗口底部也有“检查更新”。发现新版后点击“下载更新”，下载完成并经你确认后，应用会更新并重启。</p><p>下载时可以继续使用；重启前请保存内容并关闭编辑窗口。断网或下载失败不会影响当前版本。</p></section>
    <section><h2>本次改进</h2><p>{release.notes}</p></section>
    <section><h2>数据和安全</h2><p>计划、习惯和记录仍只保存在本机。检查更新不会上传这些内容。更新包经过大小、版本和 SHA-256 校验；替换失败时会尝试恢复旧版。</p><p>安装程序暂未进行商业代码签名，Windows 可能显示来源提醒。请仅使用此页面的下载链接。</p></section>
    <footer className="info-footer"><Link href="/">打开网页版</Link><Link href="/support">使用帮助</Link><Link href="/privacy">隐私政策</Link></footer>
  </article></main>;
}
