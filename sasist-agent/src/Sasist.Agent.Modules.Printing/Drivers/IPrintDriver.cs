namespace Sasist.Agent.Modules.Printing.Drivers;

public enum PrintJobFormat
{
    Pdf,
    Zpl,
    Raw,
    Html,
}

public enum PrintStatus
{
    Printed,
    Failed,
    Cancelled,
}

public sealed class PrintJobRequest
{
    public required int JobId { get; init; }
    public required string PrinterName { get; init; }
    public required PrintJobFormat Format { get; init; }
    public required byte[] Payload { get; init; }
    public int Copies { get; init; } = 1;
    public string? ContentType { get; init; }
    public IReadOnlyDictionary<string, object?>? Options { get; init; }
    public CancellationToken CancellationToken { get; init; }
}

public sealed class PrintResult
{
    public required PrintStatus Status { get; init; }
    public string? ErrorCode { get; init; }
    public string? ErrorMessage { get; init; }
    public TimeSpan Duration { get; init; }
    public int Copies { get; init; }
    public string PrinterName { get; init; } = "";
    public string DriverId { get; init; } = "";

    public static PrintResult Printed(string driverId, string printer, int copies, TimeSpan duration) =>
        new()
        {
            Status = PrintStatus.Printed,
            DriverId = driverId,
            PrinterName = printer,
            Copies = copies,
            Duration = duration,
        };

    public static PrintResult Failed(
        string driverId,
        string printer,
        int copies,
        TimeSpan duration,
        string errorCode,
        string errorMessage) =>
        new()
        {
            Status = PrintStatus.Failed,
            DriverId = driverId,
            PrinterName = printer,
            Copies = copies,
            Duration = duration,
            ErrorCode = errorCode,
            ErrorMessage = errorMessage,
        };

    public static PrintResult Cancelled(string driverId, string printer, int copies, TimeSpan duration) =>
        new()
        {
            Status = PrintStatus.Cancelled,
            DriverId = driverId,
            PrinterName = printer,
            Copies = copies,
            Duration = duration,
            ErrorCode = "CANCELLED",
            ErrorMessage = "Job cancelled",
        };
}

public interface IPrintDriver
{
    string DriverId { get; }
    PrintJobFormat Format { get; }
    Task<PrintResult> PrintAsync(PrintJobRequest job);
}

public interface IPrintDriverResolver
{
    IPrintDriver Resolve(PrintJobFormat format);
    IReadOnlyList<string> SupportedFormatTokens { get; }
}
