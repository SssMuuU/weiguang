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

internal static class WeiguangInstaller
{
    private const string PayloadName = "WeiguangPayload.zip";
    private const string UninstallKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\Weiguang";
    private const int MoveFileDelayUntilReboot = 0x4;
    private static string restartLauncher;
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
            bool ownsUpdate;
            using (Mutex update = new Mutex(true, WindowsRelease.UpdateMutex, out ownsUpdate))
            {
                if (!ownsUpdate) throw new IOException("另一个微光安装或更新操作正在进行。");
                try { return (args.Length == 4 || (args.Length == 5 && args[4] == "--no-restart")) && args[0] == "--update" ? Update(args) : Install(); }
                finally
                {
                    update.ReleaseMutex();
                    if (restartLauncher != null) Process.Start(new ProcessStartInfo { FileName = restartLauncher, UseShellExecute = false });
                }
            }
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

        string installDirectory;
        using (FolderBrowserDialog locationDialog = new FolderBrowserDialog())
        {
            locationDialog.Description = "选择安装位置；微光会在所选位置创建“微光”文件夹。";
            locationDialog.ShowNewFolderButton = true;
            locationDialog.SelectedPath = GetDefaultInstallParent();
            if (locationDialog.ShowDialog() != DialogResult.OK) return 0;
            string selected = Path.GetFullPath(locationDialog.SelectedPath);
            installDirectory = string.Equals(Path.GetFileName(selected.TrimEnd(Path.DirectorySeparatorChar)), "微光", StringComparison.OrdinalIgnoreCase)
                ? selected
                : Path.Combine(selected, "微光");
        }

        string tempDirectory = Path.Combine(Path.GetTempPath(), "weiguang-install-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempDirectory);
        try
        {
            ExtractPayload(tempDirectory);
            string stagedLauncher = Path.Combine(tempDirectory, "微光.exe");
            if (!File.Exists(stagedLauncher)) throw new InvalidDataException("安装文件不完整。请重新下载安装程序。");

            File.Copy(Assembly.GetExecutingAssembly().Location, Path.Combine(tempDirectory, "卸载微光.exe"));
            ValidateLauncher(tempDirectory);
            WindowsInstallTransaction.Apply(tempDirectory, installDirectory, () => ValidateLauncher(installDirectory));

            string installedLauncher = Path.Combine(installDirectory, "微光.exe");
            string installedUninstaller = Path.Combine(installDirectory, "卸载微光.exe");
            CreateShortcuts(installedLauncher, installDirectory);
            RegisterUninstaller(installedLauncher, installedUninstaller, installDirectory);

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

    private static void ValidateLauncher(string directory)
    {
        using (Process check = Process.Start(new ProcessStartInfo {
            FileName = Path.Combine(directory, "微光.exe"), Arguments = "--self-test",
            UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = directory
        }))
        {
            if (!check.WaitForExit(20000)) { check.Kill(); throw new IOException("新版启动自检超时。"); }
            if (check.ExitCode != 0) throw new IOException("新版启动自检失败。");
        }
    }

    private static int Update(string[] args)
    {
        string directory = Path.GetFullPath(args[1]);
        string launcher = Path.Combine(directory, "微光.exe");
        string staging = Path.Combine(Path.GetTempPath(), "weiguang-install-" + Guid.NewGuid().ToString("N"));
        int parentId;
        if (!int.TryParse(args[2], out parentId) || !args[3].StartsWith("Local\\WeiguangUpdateReady-", StringComparison.Ordinal) || !File.Exists(launcher))
            throw new IOException("更新请求无效。");
        if (FileVersionInfo.GetVersionInfo(launcher).ProductName != "微光" ||
            new Version(FileVersionInfo.GetVersionInfo(launcher).FileVersion) >= new Version(WindowsRelease.AssemblyVersion))
            throw new IOException("仅允许从旧版升级，请重新检查更新。");
        bool parentExited = false;
        try
        {
            using (Process parent = Process.GetProcessById(parentId))
            using (EventWaitHandle ready = EventWaitHandle.OpenExisting(args[3]))
            {
                if (!string.Equals(Path.GetFullPath(parent.MainModule.FileName), launcher, StringComparison.OrdinalIgnoreCase)) throw new IOException("更新目标与当前应用不一致。");
                Directory.CreateDirectory(staging);
                ExtractPayload(staging);
                File.Copy(Assembly.GetExecutingAssembly().Location, Path.Combine(staging, "卸载微光.exe"));
                ValidateLauncher(staging);
                ready.Set();
                if (!parent.WaitForExit(30000)) throw new IOException("当前应用仍在运行，更新已取消。");
                parentExited = true;
            }
            Thread.Sleep(1000); // Allow WebView2 child processes to release loaded files.
            bool ownsInstance;
            using (Mutex instance = new Mutex(true, "Local\\WeiguangDesktopApp", out ownsInstance))
            {
                if (!ownsInstance) throw new IOException("微光又被打开了，请关闭后重试更新。");
                try { WindowsInstallTransaction.Apply(staging, directory, () => ValidateLauncher(directory)); }
                finally { instance.ReleaseMutex(); }
            }
            using (RegistryKey key = Registry.CurrentUser.OpenSubKey(UninstallKey, true))
            {
                if (key != null && string.Equals(key.GetValue("InstallLocation") as string, directory, StringComparison.OrdinalIgnoreCase)) key.SetValue("DisplayVersion", WindowsRelease.Version);
            }
            return 0;
        }
        finally
        {
            try { if (Directory.Exists(staging)) Directory.Delete(staging, true); } catch { }
            // Release the update lock before the relaunched app checks it.
            if (parentExited)
            {
                if (args.Length == 4 && File.Exists(launcher)) restartLauncher = launcher;
            }
            string helperPath = Path.GetFullPath(Assembly.GetExecutingAssembly().Location);
            if (helperPath.StartsWith(Path.GetFullPath(Path.GetTempPath()), StringComparison.OrdinalIgnoreCase) && Path.GetFileName(helperPath).StartsWith("weiguang-update-", StringComparison.Ordinal))
                MoveFileEx(helperPath, null, MoveFileDelayUntilReboot);
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
            CreateShortcut(shortcut, launcher, tempDirectory);
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

    private static string GetDefaultInstallParent()
    {
        using (RegistryKey key = Registry.CurrentUser.OpenSubKey(UninstallKey))
        {
            string existing = key == null ? null : key.GetValue("InstallLocation") as string;
            if (!string.IsNullOrEmpty(existing))
            {
                DirectoryInfo parent = Directory.GetParent(existing.TrimEnd(Path.DirectorySeparatorChar));
                if (parent != null && parent.Exists) return parent.FullName;
            }
        }
        string defaultParent = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs");
        Directory.CreateDirectory(defaultParent);
        return defaultParent;
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

    private static void CreateShortcuts(string launcher, string installDirectory)
    {
        string startMenuDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "微光");
        Directory.CreateDirectory(startMenuDirectory);
        CreateShortcut(Path.Combine(startMenuDirectory, "微光.lnk"), launcher, installDirectory);
        CreateShortcut(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "微光.lnk"), launcher, installDirectory);
    }

    private static void CreateShortcut(string shortcutPath, string launcher, string workingDirectory)
    {
        Type shellType = Type.GetTypeFromProgID("WScript.Shell");
        object shell = Activator.CreateInstance(shellType);
        object shortcut = shellType.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { shortcutPath });
        Type shortcutType = shortcut.GetType();
        shortcutType.InvokeMember("TargetPath", BindingFlags.SetProperty, null, shortcut, new object[] { launcher });
        shortcutType.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, shortcut, new object[] { workingDirectory });
        shortcutType.InvokeMember("IconLocation", BindingFlags.SetProperty, null, shortcut, new object[] { launcher + ",0" });
        shortcutType.InvokeMember("Description", BindingFlags.SetProperty, null, shortcut, new object[] { "打开微光" });
        shortcutType.InvokeMember("Save", BindingFlags.InvokeMethod, null, shortcut, null);
        Marshal.FinalReleaseComObject(shortcut);
        Marshal.FinalReleaseComObject(shell);
    }

    private static void RegisterUninstaller(string launcher, string uninstaller, string installDirectory)
    {
        using (RegistryKey key = Registry.CurrentUser.CreateSubKey(UninstallKey))
        {
            key.SetValue("DisplayName", "微光");
            key.SetValue("DisplayVersion", WindowsRelease.Version);
            key.SetValue("Publisher", "微光");
            key.SetValue("DisplayIcon", launcher);
            key.SetValue("InstallLocation", installDirectory);
            key.SetValue("UninstallString", "\"" + uninstaller + "\" --uninstall");
            key.SetValue("NoModify", 1, RegistryValueKind.DWord);
            key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
        }
    }

    private static int Uninstall()
    {
        string installDirectory = Path.GetFullPath(AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar));
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
            Arguments = "--remove \"" + installDirectory + "\"",
            UseShellExecute = false,
            CreateNoWindow = true,
        });
        MessageBox.Show("微光已卸载，个人数据仍保留在这台电脑上。", "微光", MessageBoxButtons.OK, MessageBoxIcon.Information);
        return 0;
    }

    private static int RemoveInstalledFiles(string directory)
    {
        Thread.Sleep(1000);
        string requested = Path.GetFullPath(directory);
        string folderName = Path.GetFileName(requested.TrimEnd(Path.DirectorySeparatorChar));
        if (!string.Equals(folderName, "微光", StringComparison.OrdinalIgnoreCase)) return 3;
        if (!File.Exists(Path.Combine(requested, "卸载微光.exe"))) return 3;
        if (Directory.Exists(requested)) Directory.Delete(requested, true);
        MoveFileEx(Assembly.GetExecutingAssembly().Location, null, MoveFileDelayUntilReboot);
        return 0;
    }

    private static void DeleteShortcut(string path)
    {
        if (File.Exists(path)) File.Delete(path);
    }
}
