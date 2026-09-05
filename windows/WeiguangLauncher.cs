using System;
using System.Drawing;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

[assembly: AssemblyTitle("微光")]
[assembly: AssemblyProduct("微光")]
[assembly: AssemblyDescription("计划、习惯与待办")]

internal static class WeiguangLauncher
{
    private const int AppPort = 17895;
    private const string AppUrl = "http://127.0.0.1:17895/";
    private const string InstanceName = "Local\\WeiguangDesktopApp";
    private static readonly string AppDirectory = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "app"));
    private static TcpListener listener;
    private static volatile bool serverRunning;

    [DllImport("user32.dll")]
    private static extern IntPtr GetThreadDpiAwarenessContext();

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool AreDpiAwarenessContextsEqual(IntPtr first, IntPtr second);

    [STAThread]
    private static int Main(string[] args)
    {
        try
        {
            if (args.Length > 0 && args[0] == "--check") return CheckPackage();
            if (args.Length > 0 && args[0] == "--self-test") return SelfTest();
            if (args.Length > 0 && args[0] == "--dpi-check") return IsPerMonitorV2Aware() ? 0 : 6;

            bool canStart;
            using (Mutex update = new Mutex(true, WindowsRelease.UpdateMutex, out canStart))
            {
                if (!canStart) { MessageBox.Show("微光正在更新，请稍候再打开。", "微光"); return 4; }
                update.ReleaseMutex();
            }

            int check = CheckPackage();
            if (check != 0)
            {
                MessageBox.Show(
                    check == 2 ? "当前电脑缺少 WebView2 Runtime，请先通过 Windows Update 更新系统。" : "微光的应用文件不完整，请重新安装。",
                    "微光",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
                return check;
            }

            bool ownsInstance;
            using (Mutex instanceMutex = new Mutex(true, InstanceName, out ownsInstance))
            {
                if (!ownsInstance)
                {
                    MessageBox.Show("微光已经打开。", "微光", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return 0;
                }
                if (!StartServer(AppPort))
                {
                    MessageBox.Show("请先关闭旧版微光，再重新打开。", "微光", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return 4;
                }

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new WeiguangWindow(AppUrl));
                StopServer();
                GC.KeepAlive(instanceMutex);
            }
            return 0;
        }
        catch (Exception error)
        {
            StopServer();
            MessageBox.Show("微光未能启动：" + error.Message, "微光", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }

    private static int CheckPackage()
    {
        if (!File.Exists(Path.Combine(AppDirectory, "index.html"))) return 3;
        if (!File.Exists(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Microsoft.Web.WebView2.Core.dll"))) return 3;
        if (!File.Exists(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Microsoft.Web.WebView2.WinForms.dll"))) return 3;
        if (!File.Exists(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "WebView2Loader.dll"))) return 3;
        try
        {
            return string.IsNullOrEmpty(CoreWebView2Environment.GetAvailableBrowserVersionString()) ? 2 : 0;
        }
        catch
        {
            return 2;
        }
    }

    private static bool IsPerMonitorV2Aware()
    {
        try
        {
            return AreDpiAwarenessContextsEqual(GetThreadDpiAwarenessContext(), new IntPtr(-4));
        }
        catch
        {
            return false;
        }
    }

    private static int SelfTest()
    {
        int check = CheckPackage();
        if (check != 0) return check;
        if (!StartServer(0)) return 4;
        try
        {
            int testPort = ((IPEndPoint)listener.LocalEndpoint).Port;
            using (TcpClient client = new TcpClient())
            {
                client.Connect(IPAddress.Loopback, testPort);
                NetworkStream stream = client.GetStream();
                byte[] request = Encoding.ASCII.GetBytes("GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n");
                stream.Write(request, 0, request.Length);
                stream.Flush();
                using (StreamReader reader = new StreamReader(stream, Encoding.UTF8))
                {
                    string response = reader.ReadToEnd();
                    return response.Contains("200 OK") && response.Contains("<title>微光</title>") ? 0 : 5;
                }
            }
        }
        finally
        {
            StopServer();
        }
    }

    private static bool StartServer(int port)
    {
        try
        {
            listener = new TcpListener(IPAddress.Loopback, port);
            listener.Start();
            serverRunning = true;
            Thread serverThread = new Thread(ServerLoop);
            serverThread.IsBackground = true;
            serverThread.Name = "WeiguangLocalServer";
            serverThread.Start();
            return true;
        }
        catch (SocketException)
        {
            listener = null;
            return false;
        }
    }

    private static void StopServer()
    {
        serverRunning = false;
        if (listener == null) return;
        try { listener.Stop(); } catch { }
        listener = null;
    }

    private static void ServerLoop()
    {
        while (serverRunning && listener != null)
        {
            try
            {
                TcpClient client = listener.AcceptTcpClient();
                ThreadPool.QueueUserWorkItem(ServeClient, client);
            }
            catch (SocketException) { if (serverRunning) Thread.Sleep(25); }
            catch (ObjectDisposedException) { return; }
        }
    }

    private static void ServeClient(object state)
    {
        using (TcpClient client = (TcpClient)state)
        using (NetworkStream stream = client.GetStream())
        using (StreamReader reader = new StreamReader(stream, Encoding.ASCII, false, 4096, true))
        {
            string requestLine = reader.ReadLine();
            if (string.IsNullOrEmpty(requestLine)) return;
            string[] parts = requestLine.Split(' ');
            if (parts.Length < 2 || (parts[0] != "GET" && parts[0] != "HEAD"))
            {
                WriteResponse(stream, "405 Method Not Allowed", "text/plain; charset=utf-8", Encoding.UTF8.GetBytes("Method not allowed"), parts.Length > 0 && parts[0] == "HEAD");
                return;
            }

            string path = ResolveRequestPath(parts[1]);
            if (path == null)
            {
                WriteResponse(stream, "403 Forbidden", "text/plain; charset=utf-8", Encoding.UTF8.GetBytes("Forbidden"), parts[0] == "HEAD");
                return;
            }
            if (!File.Exists(path) && Path.GetExtension(path).Length == 0) path = Path.Combine(AppDirectory, "index.html");
            if (!File.Exists(path))
            {
                WriteResponse(stream, "404 Not Found", "text/plain; charset=utf-8", Encoding.UTF8.GetBytes("Not found"), parts[0] == "HEAD");
                return;
            }

            byte[] body = File.ReadAllBytes(path);
            WriteResponse(stream, "200 OK", ContentType(path), body, parts[0] == "HEAD");
        }
    }

    private static string ResolveRequestPath(string rawPath)
    {
        int queryIndex = rawPath.IndexOf('?');
        if (queryIndex >= 0) rawPath = rawPath.Substring(0, queryIndex);
        string relative = Uri.UnescapeDataString(rawPath).TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
        if (relative.Length == 0) relative = "index.html";
        string fullPath = Path.GetFullPath(Path.Combine(AppDirectory, relative));
        string safeRoot = AppDirectory.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        return fullPath.StartsWith(safeRoot, StringComparison.OrdinalIgnoreCase) ? fullPath : null;
    }

    private static void WriteResponse(NetworkStream stream, string status, string contentType, byte[] body, bool headOnly)
    {
        string header = "HTTP/1.1 " + status + "\r\n" +
                        "Content-Type: " + contentType + "\r\n" +
                        "Content-Length: " + body.Length + "\r\n" +
                        "Cache-Control: no-cache\r\n" +
                        "Connection: close\r\n\r\n";
        byte[] headerBytes = Encoding.ASCII.GetBytes(header);
        stream.Write(headerBytes, 0, headerBytes.Length);
        if (!headOnly) stream.Write(body, 0, body.Length);
    }

    private static string ContentType(string path)
    {
        switch (Path.GetExtension(path).ToLowerInvariant())
        {
            case ".html": return "text/html; charset=utf-8";
            case ".js": return "text/javascript; charset=utf-8";
            case ".css": return "text/css; charset=utf-8";
            case ".json": return "application/json; charset=utf-8";
            case ".webmanifest": return "application/manifest+json; charset=utf-8";
            case ".png": return "image/png";
            case ".svg": return "image/svg+xml";
            case ".ico": return "image/x-icon";
            case ".woff": return "font/woff";
            case ".woff2": return "font/woff2";
            default: return "application/octet-stream";
        }
    }
}

internal sealed class WeiguangWindow : Form
{
    private readonly string appUrl;
    private readonly WebView2 webView;
    private readonly Label loadingLabel;
    private readonly ToolStripStatusLabel updateStatus = new ToolStripStatusLabel();
    private readonly ToolStripDropDownButton updateButton = new ToolStripDropDownButton("检查更新");
    private WindowsUpdateInfo availableUpdate;
    private bool updating;
    private readonly CancellationTokenSource closed = new CancellationTokenSource();

    internal WeiguangWindow(string url)
    {
        appUrl = url;
        Text = "微光";
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(760, 560);
        Size = new Size(1180, 820);
        BackColor = Color.FromArgb(245, 243, 251);
        AutoScaleMode = AutoScaleMode.Dpi;
        try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }

        webView = new WebView2
        {
            Dock = DockStyle.Fill,
            DefaultBackgroundColor = Color.FromArgb(245, 243, 251),
        };
        loadingLabel = new Label
        {
            Dock = DockStyle.Fill,
            Text = "微光正在打开…",
            TextAlign = ContentAlignment.MiddleCenter,
            Font = new Font("Microsoft YaHei UI", 12F),
            ForeColor = Color.FromArgb(103, 94, 132),
            BackColor = Color.FromArgb(245, 243, 251),
        };
        Controls.Add(webView);
        Controls.Add(loadingLabel);
        StatusStrip status = new StatusStrip { SizingGrip = false };
        status.Items.Add(new ToolStripStatusLabel("微光 " + WindowsRelease.Version));
        updateStatus.Spring = true;
        updateStatus.TextAlign = ContentAlignment.MiddleRight;
        status.Items.Add(updateStatus);
        status.Items.Add(updateButton);
        updateButton.ShowDropDownArrow = false;
        updateButton.Click += async (sender, args) => { if (availableUpdate == null) await CheckUpdate(true); else await InstallUpdate(); };
        Controls.Add(status);
        FormClosed += (sender, args) => { closed.Cancel(); webView.Dispose(); };
        Shown += OnShown;
    }

    private async void OnShown(object sender, EventArgs eventArgs)
    {
        try
        {
            string userData = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Weiguang", "BrowserData");
            Directory.CreateDirectory(userData);
            CoreWebView2Environment environment = await CoreWebView2Environment.CreateAsync(null, userData);
            await webView.EnsureCoreWebView2Async(environment);
            webView.CoreWebView2.Settings.AreBrowserAcceleratorKeysEnabled = false;
            webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
            webView.CoreWebView2.NewWindowRequested += OnNewWindowRequested;
            webView.CoreWebView2.NavigationStarting += OnNavigationStarting;
            webView.Source = new Uri(appUrl);
            loadingLabel.Visible = false;
            await CheckUpdate(false);
        }
        catch (Exception error)
        {
            loadingLabel.Text = "微光未能打开\n\n" + error.Message;
        }
    }

    private async Task CheckUpdate(bool manual)
    {
        if (updating) return;
        updating = true; updateButton.Enabled = false; updateStatus.Text = "正在检查更新…";
        try
        {
            availableUpdate = await Task.Run(() => WindowsUpdater.Check());
            if (IsDisposed) return;
            updateStatus.Text = availableUpdate == null ? "已是最新版本" : "发现新版 " + availableUpdate.version;
            updateButton.Text = availableUpdate == null ? "检查更新" : "下载更新";
        }
        catch
        {
            if (IsDisposed) return;
            updateStatus.Text = "暂时无法检查更新，不影响使用";
            if (manual) MessageBox.Show(this, "暂时无法连接更新服务，请检查网络后重试。当前版本仍可正常使用。", "微光");
        }
        finally { updating = false; if (!IsDisposed) updateButton.Enabled = true; }
    }

    private async Task InstallUpdate()
    {
        if (updating || availableUpdate == null) return;
        if (MessageBox.Show(this, "发现微光 " + availableUpdate.version + "\n\n" + (availableUpdate.notes ?? "体验与稳定性改进") + "\n\n现在下载吗？下载期间可继续使用。", "更新微光", MessageBoxButtons.YesNo) != DialogResult.Yes) return;
        updating = true; updateButton.Enabled = false;
        string downloaded = null;
        try
        {
            Progress<int> progress = new Progress<int>(value => { if (!IsDisposed) updateStatus.Text = "正在下载更新 " + value + "%"; });
            downloaded = await Task.Run(() => WindowsUpdater.Download(availableUpdate, value => ((IProgress<int>)progress).Report(value), closed.Token));
            if (IsDisposed) return;
            updateStatus.Text = "下载完成，等待安装";
            if (MessageBox.Show(this, "新版已下载并通过完整性校验。\n\n请先保存正在编辑的内容。微光将关闭并打开 Windows 安装向导；完成时勾选“打开微光”即可重新启动。个人记录会保留。\n\n现在继续吗？", "更新微光", MessageBoxButtons.YesNo) != DialogResult.Yes) { updateStatus.Text = "已暂缓更新，可稍后重新下载"; return; }
            webView.Enabled = false;
            string safe = await webView.CoreWebView2.ExecuteScriptAsync("document.documentElement.dataset.weiguangUpdateReady === 'true' && !document.querySelector('.modal-layer')");
            if (safe != "true") throw new IOException("请先关闭编辑窗口，并确认数据已保存，再尝试更新。");
            // Windows Installer owns replacement and rollback; no downloaded EXE helper is run.
            Process.Start(new ProcessStartInfo {
                FileName = Path.Combine(Environment.SystemDirectory, "msiexec.exe"),
                Arguments = "/i \"" + downloaded + "\" /norestart",
                UseShellExecute = false, WorkingDirectory = Path.GetTempPath()
            });
            downloaded = null; // MSI needs its source until the installation UI finishes.
            Close();
        }
        catch (Exception error) { if (!IsDisposed) { updateStatus.Text = "更新未完成，可重试"; MessageBox.Show(this, error.Message, "微光更新", MessageBoxButtons.OK, MessageBoxIcon.Information); } }
        finally
        {
            if (downloaded != null) try { File.Delete(downloaded); } catch { }
            updating = false;
            if (!IsDisposed) { webView.Enabled = true; updateButton.Enabled = true; }
        }
    }

    private void OnNavigationStarting(object sender, CoreWebView2NavigationStartingEventArgs args)
    {
        Uri target;
        if (!Uri.TryCreate(args.Uri, UriKind.Absolute, out target)) return;
        if (target.Host == "127.0.0.1" && target.Port == 17895) return;
        args.Cancel = true;
    }

    private void OnNewWindowRequested(object sender, CoreWebView2NewWindowRequestedEventArgs args)
    {
        args.Handled = true;
    }
}
