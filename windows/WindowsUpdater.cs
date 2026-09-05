using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Security.Cryptography;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;

internal sealed class WindowsUpdateInfo
{
    public string version { get; set; }
    public string url { get; set; }
    public string sha256 { get; set; }
    public long size { get; set; }
    public string notes { get; set; }
}

internal static class WindowsUpdater
{
    internal static WindowsUpdateInfo Parse(string json)
    {
        WindowsUpdateInfo info = new JavaScriptSerializer { MaxJsonLength = 32768 }.Deserialize<WindowsUpdateInfo>(json);
        Version version;
        Uri url;
        if (info == null || !Regex.IsMatch(info.version ?? "", @"^\d+\.\d+\.\d+$") ||
            !Version.TryParse(info.version, out version) ||
            !Uri.TryCreate(info.url, UriKind.Absolute, out url) ||
            url.Scheme != "https" || url.Authority != new Uri(WindowsRelease.Origin).Authority ||
            url.UserInfo.Length != 0 || url.Query.Length != 0 || url.Fragment.Length != 0 ||
            !Regex.IsMatch(url.AbsolutePath, @"^/windows/weiguang-[0-9.]+-[a-f0-9]{12}\.msi$") ||
            !Regex.IsMatch(info.sha256 ?? "", @"^[a-fA-F0-9]{64}$") || info.size < 1024 || info.size > 100 * 1024 * 1024)
            throw new InvalidDataException("更新信息无效，已停止更新。");
        return info;
    }

    private static HttpWebRequest Request(string url)
    {
        ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
        HttpWebRequest request = (HttpWebRequest)WebRequest.Create(url);
        request.AllowAutoRedirect = false;
        request.Timeout = 15000;
        request.ReadWriteTimeout = 15000;
        request.UserAgent = "Weiguang-Windows/" + WindowsRelease.Version;
        request.CachePolicy = new System.Net.Cache.RequestCachePolicy(System.Net.Cache.RequestCacheLevel.NoCacheNoStore);
        return request;
    }

    internal static WindowsUpdateInfo Check()
    {
        using (HttpWebResponse response = (HttpWebResponse)Request(WindowsRelease.Feed + "?t=" + DateTime.UtcNow.Ticks).GetResponse())
        {
            if (response.StatusCode != HttpStatusCode.OK) throw new IOException("更新服务暂不可用。");
            using (Stream stream = response.GetResponseStream())
            using (MemoryStream bytes = new MemoryStream())
            {
                byte[] buffer = new byte[4096]; int count;
                while ((count = stream.Read(buffer, 0, buffer.Length)) > 0)
                {
                    if (bytes.Length + count > 32768) throw new InvalidDataException("更新信息过大。");
                    bytes.Write(buffer, 0, count);
                }
                WindowsUpdateInfo info = Parse(Encoding.UTF8.GetString(bytes.ToArray()).TrimStart('\uFEFF'));
                return new Version(info.version) > new Version(WindowsRelease.Version) ? info : null;
            }
        }
    }

    internal static bool Verify(string path, WindowsUpdateInfo info)
    {
        using (Stream file = File.OpenRead(path))
        using (SHA256 hash = SHA256.Create())
            return file.Length == info.size && string.Equals(BitConverter.ToString(hash.ComputeHash(file)).Replace("-", ""), info.sha256, StringComparison.OrdinalIgnoreCase);
    }

    internal static string Download(WindowsUpdateInfo info, Action<int> progress, CancellationToken cancellation)
    {
        string path = Path.Combine(Path.GetTempPath(), "weiguang-update-" + Guid.NewGuid().ToString("N") + ".msi");
        try
        {
            HttpWebRequest request = Request(info.url);
            using (cancellation.Register(request.Abort))
            using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
            {
                if (response.StatusCode != HttpStatusCode.OK || (response.ContentLength >= 0 && response.ContentLength != info.size))
                    throw new InvalidDataException("更新包大小不符。");
                using (Stream source = response.GetResponseStream())
                using (Stream target = File.Create(path))
                {
                    byte[] buffer = new byte[65536]; int count; long total = 0;
                    Stopwatch elapsed = Stopwatch.StartNew();
                    while ((count = source.Read(buffer, 0, buffer.Length)) > 0)
                    {
                        cancellation.ThrowIfCancellationRequested();
                        total += count;
                        if (total > info.size || elapsed.Elapsed.TotalMinutes > 10) throw new IOException("下载超时或更新包大小不符。");
                        target.Write(buffer, 0, count);
                        progress((int)(total * 100 / info.size));
                    }
                }
            }
            cancellation.ThrowIfCancellationRequested();
            if (!Verify(path, info)) throw new InvalidDataException("更新包校验失败，原版本未改变。请稍后重试。");
            ValidateMsi(path, info.version);
            return path;
        }
        catch { try { File.Delete(path); } catch { } throw; }
    }

    [DllImport("msi.dll", CharSet = CharSet.Unicode)]
    private static extern uint MsiOpenDatabase(string path, IntPtr persistence, out uint database);
    [DllImport("msi.dll", CharSet = CharSet.Unicode)]
    private static extern uint MsiDatabaseOpenView(uint database, string query, out uint view);
    [DllImport("msi.dll")] private static extern uint MsiViewExecute(uint view, uint record);
    [DllImport("msi.dll")] private static extern uint MsiViewFetch(uint view, out uint record);
    [DllImport("msi.dll", CharSet = CharSet.Unicode)]
    private static extern uint MsiRecordGetString(uint record, uint field, StringBuilder value, ref uint length);
    [DllImport("msi.dll")] private static extern uint MsiCloseHandle(uint handle);

    internal static void ValidateMsi(string path, string version)
    {
        uint database = 0;
        try
        {
            if (MsiOpenDatabase(path, IntPtr.Zero, out database) != 0) throw new InvalidDataException("无法读取 Windows 安装包。");
            if (Property(database, "ProductVersion") != version || Property(database, "ProductName") != "微光" ||
                !string.Equals(Property(database, "UpgradeCode"), WindowsRelease.UpgradeCode, StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException("安装包身份或版本与发布信息不符。");
        }
        finally { if (database != 0) MsiCloseHandle(database); }
    }

    private static string Property(uint database, string name)
    {
        uint view = 0, record = 0;
        try
        {
            if (MsiDatabaseOpenView(database, "SELECT `Value` FROM `Property` WHERE `Property`='" + name + "'", out view) != 0 ||
                MsiViewExecute(view, 0) != 0 || MsiViewFetch(view, out record) != 0) throw new InvalidDataException("安装包信息缺失。");
            uint length = 255; StringBuilder value = new StringBuilder(256);
            if (MsiRecordGetString(record, 1, value, ref length) != 0) throw new InvalidDataException("安装包信息无效。");
            return value.ToString();
        }
        finally { if (record != 0) MsiCloseHandle(record); if (view != 0) MsiCloseHandle(view); }
    }
}
