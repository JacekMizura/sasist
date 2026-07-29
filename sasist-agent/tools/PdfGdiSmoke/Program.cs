using System.Drawing.Printing;
using System.Text;
using Sasist.Agent.Modules.Printing.Drivers;

Directory.CreateDirectory(@"C:\ProgramData\Sasist\Agent\temp");

var pdf = Encoding.ASCII.GetBytes(
    "%PDF-1.4\n1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n" +
    "2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n" +
    "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] >>endobj\n" +
    "xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n" +
    "trailer<< /Size 4 /Root 1 0 R >>\nstartxref\n178\n%%EOF\n");

var epson = PrinterSettings.InstalledPrinters.Cast<string>()
    .FirstOrDefault(p => p.Contains("EPSON", StringComparison.OrdinalIgnoreCase))
    ?? throw new InvalidOperationException("No EPSON printer");

Console.WriteLine($"epson={epson}");
Console.WriteLine($"pdfBytes={pdf.Length}");

var driver = new PdfPrintDriver();
var result = await driver.PrintAsync(new PrintJobRequest
{
    JobId = 999003,
    PrinterName = epson,
    Format = PrintJobFormat.Pdf,
    Payload = pdf,
    Copies = 1,
    CancellationToken = CancellationToken.None,
});

Console.WriteLine($"status={result.Status} driver={result.DriverId} code={result.ErrorCode} msg={result.ErrorMessage} durationMs={result.Duration.TotalMilliseconds:0}");

var logPath = @"C:\ProgramData\Sasist\Agent\logs\pdf-driver.log";
Console.WriteLine("--- pdf-driver.log ---");
Console.WriteLine(File.ReadAllText(logPath));

Console.WriteLine("--- recent EPSON jobs ---");
foreach (var j in System.Drawing.Printing.PrinterSettings.InstalledPrinters.Cast<string>().Take(0)) { }
return result.Status == PrintStatus.Printed ? 0 : 1;
