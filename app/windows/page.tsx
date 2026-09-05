import Link from 'next/link';
import release from '@/public/windows/latest-msi.json';

export default function WindowsDownload() {
  return <main className="info-page"><article className="info-card glass-panel">
    <header className="info-header">
      <Link className="info-brand" href="/"><span className="brand-mark">微</span><span>微光</span></Link>
      <span className="info-kicker">Windows 桌面版</span>
      <h1>微光 Windows 安装版</h1>
      <p>版本 {release.version} · Windows 10 / 11（64 位）· 标准 MSI 安装</p>
    </header>
    <section>
      <a className="submit-button" href={release.url} download>下载新版 MSI 安装包</a>
      <p>先关闭微光，运行下载的 MSI，确认原安装位置并完成安装，<strong>无需卸载旧版</strong>。完成时勾选“打开微光”即可启动。建议升级前导出一份备份。</p>
      <p>0.2.0 的 EXE 安装包已撤回。请不要恢复被隔离的文件，新版不再使用自制解包安装器。</p>
    </section>
    <section><h2>你的记录</h2><p>暂停分发不会清空本机记录。请保留个人数据目录，能正常打开原版本时建议导出 JSON 备份。网页版与 Windows 版的数据不会自动同步。</p></section>
    <section><h2>之后如何更新</h2><p>窗口底部可检查并下载新版。下载通过校验后，微光会关闭并打开 Windows 安装向导，由系统完成升级和回退。完成时勾选“打开微光”；若取消安装，可以从原快捷方式重新打开。</p></section>
    <section><h2>安全检查</h2><p>此安装包发布前已在开启实时防护、更新官方病毒库的 Windows 上通过 Defender 扫描，未检测到威胁；也已验证安装、升级、失败回退和数据保留。</p><p>这不代表微软已经认定旧告警为误报，也不保证所有环境都会放行。安装包尚无商业代码签名；如果再次出现病毒告警，请停止安装并反馈，不要关闭防护或添加白名单。</p></section>
    <footer className="info-footer"><Link href="/">打开网页版</Link><Link href="/support">使用帮助</Link><Link href="/privacy">隐私政策</Link></footer>
  </article></main>;
}
