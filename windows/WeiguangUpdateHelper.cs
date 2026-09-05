using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Windows.Forms;

internal static class WeiguangUpdateHelper
{
    [STAThread]
    private static int Main(string[] args)
    {
        if (args.Length == 1 && args[0] == "--self-test") return 0;
        if (args.Length != 3) return 2;

        string package = Path.GetFullPath(args[0]);
        string launcher = Path.GetFullPath(args[1]);
        int parentId;
        if (!package.EndsWith(".msi", StringComparison.OrdinalIgnoreCase) || !File.Exists(package) ||
            !launcher.EndsWith("微光.exe", StringComparison.OrdinalIgnoreCase) || !int.TryParse(args[2], out parentId)) return 2;

        string logDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Weiguang", "Logs");
        Directory.CreateDirectory(logDirectory);
        string log = Path.Combine(logDirectory, "update-" + DateTime.Now.ToString("yyyyMMdd-HHmmss") + ".log");

        try
        {
            try { Process.GetProcessById(parentId).WaitForExit(15000); } catch (ArgumentException) { }
            bool ownsUpdate;
            using (Mutex update = new Mutex(true, WindowsRelease.UpdateMutex, out ownsUpdate))
            {
                if (!ownsUpdate) return 4;
                Process installer = Process.Start(new ProcessStartInfo {
                    FileName = Path.Combine(Environment.SystemDirectory, "msiexec.exe"),
                    Arguments = "/i \"" + package + "\" /passive /norestart /l*v \"" + log + "\"",
                    UseShellExecute = false,
                    WorkingDirectory = Path.GetTempPath()
                });
                if (installer == null) throw new IOException("无法启动 Windows Installer。");
                installer.WaitForExit();
                if (installer.ExitCode != 0 && installer.ExitCode != 3010) throw new IOException("Windows Installer 返回错误 " + installer.ExitCode + "。");
            }

            if (!File.Exists(launcher)) throw new FileNotFoundException("新版启动文件不存在。", launcher);
            Process.Start(new ProcessStartInfo { FileName = launcher, UseShellExecute = true, WorkingDirectory = Path.GetDirectoryName(launcher) });
            return 0;
        }
        catch (Exception error)
        {
            MessageBox.Show("更新未能完成，原版本仍可继续使用。\n\n" + error.Message + "\n\n诊断日志：" + log, "微光更新", MessageBoxButtons.OK, MessageBoxIcon.Information);
            try { if (File.Exists(launcher)) Process.Start(new ProcessStartInfo { FileName = launcher, UseShellExecute = true, WorkingDirectory = Path.GetDirectoryName(launcher) }); } catch { }
            return 1;
        }
        finally { try { File.Delete(package); } catch { } }
    }
}
