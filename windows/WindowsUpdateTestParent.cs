using System;
using System.Reflection;
using System.Threading;
[assembly: AssemblyProduct("微光")]
[assembly: AssemblyVersion("0.1.0.0")]
[assembly: AssemblyFileVersion("0.1.0.0")]
internal static class WindowsUpdateTestParent
{
    private static int Main(string[] args)
    {
        using (EventWaitHandle ready = EventWaitHandle.OpenExisting(args[0]))
            return ready.WaitOne(60000) ? 0 : 1;
    }
}
