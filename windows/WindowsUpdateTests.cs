using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Web.Script.Serialization;

internal static class WindowsUpdateTests
{
    private static int assertions;
    private static void Assert(bool value, string name) { if (!value) throw new Exception(name); assertions++; }
    private static void Reject(Action action, string name)
    {
        bool rejected = false; try { action(); } catch { rejected = true; }
        Assert(rejected, name);
    }
    private static string Feed(string url)
    {
        return new JavaScriptSerializer().Serialize(new WindowsUpdateInfo { version = "0.3.0", url = url, sha256 = new string('a', 64), size = 2048 });
    }
    private static void Seed(string root, string content)
    {
        Directory.CreateDirectory(Path.Combine(root, "app"));
        File.WriteAllText(Path.Combine(root, "微光.exe"), content);
        File.WriteAllText(Path.Combine(root, "app", "index.html"), content);
    }
    private static int Main(string[] args)
    {
        if (args.Length == 2 && args[0] == "--msi")
        {
            WindowsUpdater.ValidateMsi(args[1], WindowsRelease.Version);
            Reject(() => WindowsUpdater.ValidateMsi(args[1], "999.0.0"), "MSI version mismatch rejected");
            Console.WriteLine("Production MSI identity/version check passed.");
            return 0;
        }
        if (args.Length == 2 && args[0] == "--live")
        {
            WindowsUpdateInfo release = WindowsUpdater.Parse(File.ReadAllText(args[1]));
            WindowsUpdateInfo newer = WindowsUpdater.Check();
            string downloaded = WindowsUpdater.Download(release, value => {}, System.Threading.CancellationToken.None);
            try { Console.WriteLine("Live update service and verified package download passed. Newer version available: " + (newer != null)); }
            finally { File.Delete(downloaded); }
            return 0;
        }
        string root = Path.Combine(Path.GetTempPath(), "weiguang-update-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try
        {
            string url = WindowsRelease.Origin + "/windows/weiguang-0.3.0-aaaaaaaaaaaa.msi";
            Assert(WindowsUpdater.Parse(Feed(url)).version == "0.3.0", "valid release");
            Reject(() => WindowsUpdater.Parse(Feed(url.Replace("https:", "http:"))), "reject HTTP");
            Reject(() => WindowsUpdater.Parse(Feed("https://example.com/windows/weiguang-0.3.0-aaaaaaaaaaaa.msi")), "reject different host");
            Reject(() => WindowsUpdater.Parse(Feed(url + "?redirect=1")), "reject query");
            Reject(() => WindowsUpdater.Parse(Feed(url.Replace("/windows/", "/other/"))), "reject other path");
            Reject(() => WindowsUpdater.Parse("null"), "reject empty metadata");
            Reject(() => WindowsUpdater.Parse(Feed(url).Replace("0.3.0", "invalid")), "reject invalid version");
            Reject(() => WindowsUpdater.Parse(Feed(url).Replace("2048", "999999999")), "reject oversized download");
            Reject(() => WindowsUpdater.Parse(Feed(url).Replace(new string('a', 64), "bad")), "reject hash");
            string package = Path.Combine(root, "package.exe"); File.WriteAllText(package, "payload");
            WindowsUpdateInfo info = new WindowsUpdateInfo { size = new FileInfo(package).Length };
            using (SHA256 sha = SHA256.Create()) info.sha256 = BitConverter.ToString(sha.ComputeHash(File.ReadAllBytes(package))).Replace("-", "");
            Assert(WindowsUpdater.Verify(package, info), "valid hash");
            File.WriteAllText(package, "changed");
            Assert(!WindowsUpdater.Verify(package, info), "corruption rejected");
            Reject(() => WindowsUpdater.Parse(Feed(url.Replace(".msi", ".exe"))), "legacy executable rejected");
            Reject(() => WindowsUpdater.Parse("{\"status\":\"suspended\"}"), "suspended feed rejected");
            Reject(() => WindowsUpdater.ValidateMsi(package, "0.3.0"), "non-MSI rejected");
            Console.WriteLine("Windows updater: " + assertions + " assertions passed.");
            return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error); return 1; }
        finally { Directory.Delete(root, true); }
    }
}
