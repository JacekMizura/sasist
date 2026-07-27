using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;

namespace Sasist.Agent.Modules.Printing.Drivers;

/// <summary>Win32 RAW spooler — bytes go to the printer without GDI rendering.</summary>
[SupportedOSPlatform("windows")]
public static class WindowsRawSpooler
{
    public static void Send(string printerName, byte[] data, string documentName, TimeSpan timeout)
    {
        if (string.IsNullOrWhiteSpace(printerName))
            throw new ArgumentException("Printer name required", nameof(printerName));
        if (data.Length == 0)
            throw new ArgumentException("Empty payload", nameof(data));

        var di = new DocInfo1
        {
            pDocName = string.IsNullOrWhiteSpace(documentName) ? "Sasist Agent RAW" : documentName,
            pDatatype = "RAW",
            pOutputFile = null,
        };

        if (!OpenPrinter(printerName, out var hPrinter, IntPtr.Zero))
            throw new Win32Exception(Marshal.GetLastWin32Error(), $"OpenPrinter failed: {printerName}");

        try
        {
            using var cts = new CancellationTokenSource(timeout);
            var jobId = StartDocPrinter(hPrinter, 1, ref di);
            if (jobId <= 0)
                throw new Win32Exception(Marshal.GetLastWin32Error(), "StartDocPrinter failed");

            try
            {
                if (!StartPagePrinter(hPrinter))
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "StartPagePrinter failed");

                try
                {
                    cts.Token.ThrowIfCancellationRequested();
                    var pinned = GCHandle.Alloc(data, GCHandleType.Pinned);
                    try
                    {
                        if (!WritePrinter(hPrinter, pinned.AddrOfPinnedObject(), data.Length, out var written) ||
                            written != data.Length)
                        {
                            throw new Win32Exception(
                                Marshal.GetLastWin32Error(),
                                $"WritePrinter incomplete ({written}/{data.Length})");
                        }
                    }
                    finally
                    {
                        pinned.Free();
                    }
                }
                finally
                {
                    EndPagePrinter(hPrinter);
                }
            }
            finally
            {
                EndDocPrinter(hPrinter);
            }
        }
        finally
        {
            ClosePrinter(hPrinter);
        }
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct DocInfo1
    {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string? pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDatatype;
    }

    [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern int StartDocPrinter(IntPtr hPrinter, int level, ref DocInfo1 pDocInfo);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);
}
