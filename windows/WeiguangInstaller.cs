using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("微光安装程序")]
[assembly: AssemblyProduct("微光")]
[assembly: AssemblyDescription("微光 Windows 安装程序")]
[assembly: AssemblyVersion("0.1.0.0")]
[assembly: AssemblyFileVersion("0.1.0.0")]

internal static class WeiguangInstaller
{
    private const string PayloadName = "WeiguangPayload.zip";
    private const string UninstallKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\Weiguang";
    private const int MoveFileDelayUntilReboot = 0x4;
    private static readonly string InstallDirectory = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "Programs",
        "Weiguang");

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool MoveFileEx(string existingFileName, string newFileName, int flags);

    [STAThread]
    private static int Main(string[] args)
    {
        try
        {
            if (args.Length > 0 && args[0] == "--check") return HasPayload() ? 0 : 2;
            if (args.Length > 0 && args[0] == "--self-test") return SelfTest();
            if (args.Length > 0 && args[0] == "--uninstall") return Uninstall();
            if (args.Length > 1 && args[0] == "--remove") return RemoveInstalledFiles(args[1]);
            return Install();
        }
        catch (Exception error)
        {
            MessageBox.Show(
                "操作未完成：" + error.Message,
                "微光",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            return 1;
        }
    }

    private static bool HasPayload()
    {
        using (Stream payload = Assembly.GetExecutingAssembly().GetManifestResourceStream(PayloadName))
        {
            return payload != null && payload.Length > 0;
        }
    }

    private static int Install()
    {
        if (IsAppRunning())
        {
            MessageBox.Show("请先关闭正在运行的微光，再重新运行安装程序。", "安装微光", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return 4;
        }

        DialogResult answer = MessageBox.Show(
            "将微光安装到当前电脑，并创建桌面和开始菜单入口。\n\n安装过程不需要管理员权限。",
            "安装微光",
            MessageBoxButtons.OKCancel,
            MessageBoxIcon.Information);
        if (answer != DialogResult.OK) return 0;

        string tempDirectory = Path.Combine(Path.GetTempPath(), "weiguang-install-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempDirectory);
        try
        {
            ExtractPayload(tempDirectory);
            string stagedLauncher = Path.Combine(tempDirectory, "微光.exe");
            if (!File.Exists(stagedLauncher)) throw new InvalidDataException("安装文件不完整。请重新下载安装程序。");

            Directory.CreateDirectory(InstallDirectory);
            string installedApp = Path.Combine(InstallDirectory, "app");
            if (Directory.Exists(installedApp)) Directory.Delete(installedApp, true);
            CopyDirectory(tempDirectory, InstallDirectory);

            string installedLauncher = Path.Combine(InstallDirectory, "微光.exe");
            string installedUninstaller = Path.Combine(InstallDirectory, "卸载微光.exe");
            File.Copy(Assembly.GetExecutingAssembly().Location, installedUninstaller, true);
            CreateShortcuts(installedLauncher);
            RegisterUninstaller(installedLauncher, installedUninstaller);

            DialogResult launch = MessageBox.Show(
                "微光安装完成。\n\n现在打开微光吗？",
                "微光",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Information);
            if (launch == DialogResult.Yes)
            {
                Process.Start(new ProcessStartInfo { FileName = installedLauncher, UseShellExecute = true });
            }
            return 0;
        }
        finally
        {
            if (Directory.Exists(tempDirectory)) Directory.Delete(tempDirectory, true);
        }
    }

    private static int SelfTest()
    {
        string tempDirectory = Path.Combine(Path.GetTempPath(), "weiguang-installer-check-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempDirectory);
        try
        {
            ExtractPayload(tempDirectory);
            string launcher = Path.Combine(tempDirectory, "微光.exe");
            string index = Path.Combine(tempDirectory, "app", "index.html");
            if (!File.Exists(launcher) || !File.Exists(index)) return 5;
            string shortcut = Path.Combine(tempDirectory, "微光.lnk");
            CreateShortcut(shortcut, launcher);
            return File.Exists(shortcut) ? 0 : 6;
        }
        finally
        {
            if (Directory.Exists(tempDirectory)) Directory.Delete(tempDirectory, true);
        }
    }

    private static bool IsAppRunning()
    {
        try
        {
            using (TcpClient client = new TcpClient())
            {
                client.Connect(IPAddress.Loopback, 17895);
                return true;
            }
        }
        catch (SocketException)
        {
            return false;
        }
    }

    private static void ExtractPayload(string destination)
    {
        using (Stream payload = Assembly.GetExecutingAssembly().GetManifestResourceStream(PayloadName))
        {
            if (payload == null) throw new InvalidDataException("安装程序缺少应用文件。");
            using (ZipArchive archive = new ZipArchive(payload, ZipArchiveMode.Read))
            {
                string safeRoot = Path.GetFullPath(destination).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
                foreach (ZipArchiveEntry entry in archive.Entries)
                {
                    string target = Path.GetFullPath(Path.Combine(destination, entry.FullName.Replace('/', Path.DirectorySeparatorChar)));
                    if (!target.StartsWith(safeRoot, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("安装包包含不安全的文件路径。");
                    if (string.IsNullOrEmpty(entry.Name))
                    {
                        Directory.CreateDirectory(target);
                        continue;
                    }
                    Directory.CreateDirectory(Path.GetDirectoryName(target));
                    entry.ExtractToFile(target, true);
                }
            }
        }
    }

    private static void CopyDirectory(string source, string destination)
    {
        foreach (string directory in Directory.GetDirectories(source, "*", SearchOption.AllDirectories))
        {
            Directory.CreateDirectory(directory.Replace(source, destination));
        }
        foreach (string file in Directory.GetFiles(source, "*", SearchOption.AllDirectories))
        {
            string target = file.Replace(source, destination);
            Directory.CreateDirectory(Path.GetDirectoryName(target));
            File.Copy(file, target, true);
        }
    }

    private static void CreateShortcuts(string launcher)
    {
        string startMenuDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "微光");
        Directory.CreateDirectory(startMenuDirectory);
        CreateShortcut(Path.Combine(startMenuDirectory, "微光.lnk"), launcher);
        CreateShortcut(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "微光.lnk"), launcher);
    }

    private static void CreateShortcut(string shortcutPath, string launcher)
    {
        Type shellType = Type.GetTypeFromProgID("WScript.Shell");
        object shell = Activator.CreateInstance(shellType);
        object shortcut = shellType.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { shortcutPath });
        Type shortcutType = shortcut.GetType();
        shortcutType.InvokeMember("TargetPath", BindingFlags.SetProperty, null, shortcut, new object[] { launcher });
        shortcutType.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, shortcut, new object[] { InstallDirectory });
        shortcutType.InvokeMember("IconLocation", BindingFlags.SetProperty, null, shortcut, new object[] { launcher + ",0" });
        shortcutType.InvokeMember("Description", BindingFlags.SetProperty, null, shortcut, new object[] { "打开微光" });
        shortcutType.InvokeMember("Save", BindingFlags.InvokeMethod, null, shortcut, null);
        Marshal.FinalReleaseComObject(shortcut);
        Marshal.FinalReleaseComObject(shell);
    }

    private static void RegisterUninstaller(string launcher, string uninstaller)
    {
        using (RegistryKey key = Registry.CurrentUser.CreateSubKey(UninstallKey))
        {
            key.SetValue("DisplayName", "微光");
            key.SetValue("DisplayVersion", "0.1.0");
            key.SetValue("Publisher", "微光");
            key.SetValue("DisplayIcon", launcher);
            key.SetValue("InstallLocation", InstallDirectory);
            key.SetValue("UninstallString", "\"" + uninstaller + "\" --uninstall");
            key.SetValue("NoModify", 1, RegistryValueKind.DWord);
            key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
        }
    }

    private static int Uninstall()
    {
        DialogResult answer = MessageBox.Show(
            "确定卸载微光吗？\n\n你的计划和习惯数据会保留，重新安装后仍可继续使用。",
            "卸载微光",
            MessageBoxButtons.YesNo,
            MessageBoxIcon.Question);
        if (answer != DialogResult.Yes) return 0;

        DeleteShortcut(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "微光.lnk"));
        string startMenuDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "微光");
        if (Directory.Exists(startMenuDirectory)) Directory.Delete(startMenuDirectory, true);
        Registry.CurrentUser.DeleteSubKeyTree(UninstallKey, false);

        string helper = Path.Combine(Path.GetTempPath(), "weiguang-remove-" + Guid.NewGuid().ToString("N") + ".exe");
        File.Copy(Assembly.GetExecutingAssembly().Location, helper, true);
        Process.Start(new ProcessStartInfo
        {
            FileName = helper,
            Arguments = "--remove \"" + InstallDirectory + "\"",
            UseShellExecute = false,
            CreateNoWindow = true,
        });
        MessageBox.Show("微光已卸载，个人数据仍保留在这台电脑上。", "微光", MessageBoxButtons.OK, MessageBoxIcon.Information);
        return 0;
    }

    private static int RemoveInstalledFiles(string directory)
    {
        Thread.Sleep(1000);
        string expected = Path.GetFullPath(InstallDirectory);
        string requested = Path.GetFullPath(directory);
        if (!string.Equals(expected, requested, StringComparison.OrdinalIgnoreCase)) return 3;
        if (Directory.Exists(requested)) Directory.Delete(requested, true);
        MoveFileEx(Assembly.GetExecutingAssembly().Location, null, MoveFileDelayUntilReboot);
        return 0;
    }

    private static void DeleteShortcut(string path)
    {
        if (File.Exists(path)) File.Delete(path);
    }
}
