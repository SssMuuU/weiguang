using System;
using System.Collections.Generic;
using System.IO;

// Only these application-owned entries may be replaced; other files are untouched.
internal static class WindowsInstallTransaction
{
    internal static readonly string[] Entries = { "app", "Microsoft.Web.WebView2.Core.dll", "Microsoft.Web.WebView2.WinForms.dll", "WebView2Loader.dll", "使用说明.txt", "卸载微光.exe", "微光.exe" };

    internal static void Apply(string staged, string destination, Action validate)
    {
        destination = Path.GetFullPath(destination);
        if (Directory.GetParent(destination) == null || !File.Exists(Path.Combine(staged, "微光.exe")) || !File.Exists(Path.Combine(staged, "app", "index.html")))
            throw new IOException("应用文件不完整或安装位置无效。");
        Directory.CreateDirectory(destination);
        foreach (string name in Entries)
        {
            string path = Path.Combine(destination, name);
            if ((File.Exists(path) || Directory.Exists(path)) && (File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0)
                throw new IOException("安装目录包含链接，请选择普通文件夹。");
        }
        // Staging and backup are under the same install directory, ensuring same-volume moves.
        string transaction = Path.Combine(destination, ".weiguang-update-" + Guid.NewGuid().ToString("N"));
        string incoming = Path.Combine(transaction, "new");
        string backup = Path.Combine(transaction, "backup");
        Directory.CreateDirectory(incoming); Directory.CreateDirectory(backup);
        List<string> saved = new List<string>(); List<string> installed = new List<string>();
        bool safeToClean = false;
        try
        {
            foreach (string name in Entries) Copy(Path.Combine(staged, name), Path.Combine(incoming, name));
            foreach (string name in Entries)
            {
                string target = Path.Combine(destination, name);
                if (File.Exists(target) || Directory.Exists(target)) { Move(target, Path.Combine(backup, name)); saved.Add(name); }
                string next = Path.Combine(incoming, name);
                if (File.Exists(next) || Directory.Exists(next)) { Move(next, target); installed.Add(name); }
            }
            validate();
            safeToClean = true;
        }
        catch (Exception failure)
        {
            try
            {
                for (int i = installed.Count - 1; i >= 0; i--) Move(Path.Combine(destination, installed[i]), Path.Combine(incoming, installed[i]));
                for (int i = saved.Count - 1; i >= 0; i--) Move(Path.Combine(backup, saved[i]), Path.Combine(destination, saved[i]));
                safeToClean = true;
            }
            catch (Exception rollback)
            {
                throw new IOException("更新未完成，旧版备份保留在：" + backup + "。请勿删除此目录。恢复失败：" + rollback.Message, failure);
            }
            throw new IOException("更新未完成，已恢复更新前的应用文件：" + failure.Message, failure);
        }
        finally
        {
            // Never clean a backup whose restoration failed.
            if (safeToClean) try { Directory.Delete(transaction, true); } catch { }
        }
    }

    private static void Move(string source, string target)
    {
        if (Directory.Exists(source)) Directory.Move(source, target); else File.Move(source, target);
    }

    private static void Copy(string source, string target)
    {
        if (Directory.Exists(source))
        {
            if ((File.GetAttributes(source) & FileAttributes.ReparsePoint) != 0) throw new IOException("应用包不能包含目录链接。");
            Directory.CreateDirectory(target);
            foreach (string item in Directory.GetFileSystemEntries(source)) Copy(item, Path.Combine(target, Path.GetFileName(item)));
        }
        else if (File.Exists(source)) File.Copy(source, target, false);
    }
}
