import Link from 'next/link';

export default function WindowsDownload() {
  return <main className="info-page"><article className="info-card glass-panel">
    <header className="info-header">
      <Link className="info-brand" href="/"><span className="brand-mark">微</span><span>微光</span></Link>
      <span className="info-kicker">Windows 桌面版</span>
      <h1>Windows 下载暂时停用</h1>
      <p>正在排查安装包的 Windows 安全告警</p>
    </header>
    <section>
      <p>0.2.0 安装包被 Microsoft Defender 拦截，已暂停分发和更新。在复核完成前，请勿运行此安装包、恢复隔离文件或关闭防护。</p>
    </section>
    <section><h2>你的记录</h2><p>暂停分发不会清空本机记录。请保留个人数据目录，能正常打开原版本时建议导出 JSON 备份。网页版与 Windows 版的数据不会自动同步。</p></section>
    <footer className="info-footer"><Link href="/">打开网页版</Link><Link href="/support">使用帮助</Link><Link href="/privacy">隐私政策</Link></footer>
  </article></main>;
}
