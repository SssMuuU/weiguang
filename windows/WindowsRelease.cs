using System.Reflection;

[assembly: AssemblyVersion(WindowsRelease.AssemblyVersion)]
[assembly: AssemblyFileVersion(WindowsRelease.AssemblyVersion)]

internal static class WindowsRelease
{
    internal const string Version = "0.2.0";
    internal const string AssemblyVersion = Version + ".0";
    internal const string Origin = "https://weiguang-plan-habits.workspace-192140.chatgpt.site";
    internal const string Feed = Origin + "/windows/latest.json";
    internal const string UpdateMutex = "Local\\WeiguangDesktopUpdate";
}
