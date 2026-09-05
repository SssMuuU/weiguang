using System.Reflection;

[assembly: AssemblyVersion(WindowsRelease.AssemblyVersion)]
[assembly: AssemblyFileVersion(WindowsRelease.AssemblyVersion)]

internal static class WindowsRelease
{
    internal const string Version = "0.2.3";
    internal const string AssemblyVersion = Version + ".0";
    internal const string Origin = "https://weiguang-plan-habits.workspace-192140.chatgpt.site";
    internal const string Feed = Origin + "/windows/latest-msi.json";
    internal const string UpgradeCode = "{C82A99EB-50AB-4F12-9BBA-4DFA0AD75E60}";
    internal const string UpdateMutex = "Local\\WeiguangDesktopUpdate";
}
