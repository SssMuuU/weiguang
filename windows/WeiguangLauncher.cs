using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Windows.Forms;

[assembly: AssemblyTitle("微光")]
[assembly: AssemblyProduct("微光")]
[assembly: AssemblyDescription("计划、习惯与待办")]
[assembly: AssemblyVersion("0.1.0.0")]
[assembly: AssemblyFileVersion("0.1.0.0")]

internal static class WeiguangLauncher
{
    private const int AppPort = 17895;
    private const string AppUrl = "http://127.0.0.1:17895/";
    private static readonly string AppDirectory = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "app"));
    private static TcpListener listener;
    private static volatile bool serverRunning;

    [STAThread]
    private static int Main(string[] args)
    {
        try
        {
            string browser = FindBrowser();
            if (args.Length > 0 && args[0] == "--check") return CheckPackage(browser);
            if (args.Length > 0 && args[0] == "--self-test") return SelfTest(browser);

            int check = CheckPackage(browser);
            if (check != 0)
            {
                MessageBox.Show(
                    check == 2 ? "微光需要 Microsoft Edge 或 Google Chrome 才能运行。" : "微光的应用文件不完整，请重新解压安装包。",
                    "微光",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
                return check;
            }

            bool ownsServer = StartServer(AppPort);
            Process appProcess = OpenApp(browser);
            if (ownsServer && appProcess != null)
            {
                appProcess.WaitForExit();
                StopServer();
            }
            return 0;
        }
        catch (Exception error)
        {
            StopServer();
            MessageBox.Show(
                "微光未能启动：" + error.Message,
                "微光",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return 1;
        }
    }

    private static int CheckPackage(string browser)
    {
        if (browser == null) return 2;
        if (!File.Exists(Path.Combine(AppDirectory, "index.html"))) return 3;
        return 0;
    }

    private static int SelfTest(string browser)
    {
        int check = CheckPackage(browser);
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

    private static Process OpenApp(string browser)
    {
        string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        string profile = Path.Combine(localAppData, "Weiguang", "BrowserData");
        Directory.CreateDirectory(profile);
        return Process.Start(new ProcessStartInfo
        {
            FileName = browser,
            Arguments = "--app=" + AppUrl + " --user-data-dir=\"" + profile + "\" --no-first-run --start-maximized",
            UseShellExecute = false,
        });
    }

    private static string FindBrowser()
    {
        foreach (string browser in BrowserCandidates())
        {
            if (File.Exists(browser)) return browser;
        }
        return null;
    }

    private static string[] BrowserCandidates()
    {
        string programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        string programFilesX86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
        string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        return new[]
        {
            Path.Combine(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(localAppData, "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
            Path.Combine(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
            Path.Combine(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
        };
    }
}
