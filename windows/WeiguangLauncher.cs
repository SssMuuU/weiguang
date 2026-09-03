using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

[assembly: AssemblyTitle("微光")]
[assembly: AssemblyProduct("微光")]
[assembly: AssemblyDescription("计划、习惯与待办")]
[assembly: AssemblyVersion("0.1.0.0")]
[assembly: AssemblyFileVersion("0.1.0.0")]

internal static class WeiguangLauncher
{
    private const string AppUrl = "https://weiguang-plan-habits.workspace-192140.chatgpt.site";

    [STAThread]
    private static int Main(string[] args)
    {
        try
        {
            string browser = FindBrowser();
            if (args.Length > 0 && args[0] == "--check") return browser == null ? 2 : 0;

            if (browser != null)
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = browser,
                    Arguments = "--app=" + AppUrl + " --start-maximized",
                    UseShellExecute = true,
                });
                return 0;
            }

            Process.Start(new ProcessStartInfo { FileName = AppUrl, UseShellExecute = true });
            return 0;
        }
        catch (Exception)
        {
            MessageBox.Show(
                "无法自动打开微光。请复制下面的地址到浏览器：\n\n" + AppUrl,
                "微光",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return 1;
        }
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
