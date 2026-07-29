using System.Text;
using Sasist.Agent.Modules.Printing.Drivers;

namespace Sasist.Agent.Tests;

public class PrintDriverTests
{
    [Theory]
    [InlineData("pdf", PrintJobFormat.Pdf)]
    [InlineData("zpl", PrintJobFormat.Zpl)]
    [InlineData("raw_zpl", PrintJobFormat.Zpl)]
    [InlineData("epl", PrintJobFormat.Epl)]
    [InlineData("escpos", PrintJobFormat.EscPos)]
    [InlineData("pcl", PrintJobFormat.Pcl)]
    [InlineData("postscript", PrintJobFormat.PostScript)]
    [InlineData("raw", PrintJobFormat.Raw)]
    [InlineData("html", PrintJobFormat.Html)]
    [InlineData("image", PrintJobFormat.Image)]
    [InlineData("png", PrintJobFormat.Image)]
    public void FormatParser_RecognizesTokens(string token, PrintJobFormat expected)
    {
        Assert.True(PrintJobFormatParser.TryParse(token, out var format));
        Assert.Equal(expected, format);
    }

    [Theory]
    [InlineData(PrintJobFormat.Zpl)]
    [InlineData(PrintJobFormat.Epl)]
    [InlineData(PrintJobFormat.EscPos)]
    [InlineData(PrintJobFormat.Pcl)]
    [InlineData(PrintJobFormat.PostScript)]
    [InlineData(PrintJobFormat.Raw)]
    public void NativeLanguages_UseRawSpoolerPath(PrintJobFormat format)
    {
        Assert.True(PrintJobFormatParser.IsNativePrinterLanguage(format));
        var driver = new DriverFactory().Resolve(format);
        Assert.IsType<RawPrintDriver>(driver);
    }

    [Theory]
    [InlineData(PrintJobFormat.Pdf)]
    [InlineData(PrintJobFormat.Html)]
    [InlineData(PrintJobFormat.Image)]
    public void RenderedFormats_AreNotNativeLanguages(PrintJobFormat format)
    {
        Assert.False(PrintJobFormatParser.IsNativePrinterLanguage(format));
    }

    [Fact]
    public void DriverFactory_Pdf_UsesPdfPrintDriver_NotRaw()
    {
        var factory = new DriverFactory();
        var driver = factory.Resolve(PrintJobFormat.Pdf);
        Assert.IsType<PdfPrintDriver>(driver);
        Assert.Equal("pdf", driver.DriverId);
        Assert.False(PrintJobFormatParser.IsNativePrinterLanguage(PrintJobFormat.Pdf));
    }

    [Fact]
    public void DriverFactory_ExposesAllFormats()
    {
        var factory = new DriverFactory();
        Assert.Contains("pdf", factory.SupportedFormatTokens);
        Assert.Contains("zpl", factory.SupportedFormatTokens);
        Assert.Contains("epl", factory.SupportedFormatTokens);
        Assert.Contains("escpos", factory.SupportedFormatTokens);
        Assert.Contains("image", factory.SupportedFormatTokens);
        Assert.Equal("zpl", factory.Resolve(PrintJobFormat.Zpl).DriverId);
        Assert.Equal("image", factory.Resolve(PrintJobFormat.Image).DriverId);
    }

    [Fact]
    public async Task PdfDriver_RejectsNonPdfPayload()
    {
        var driver = new PdfPrintDriver();
        var result = await driver.PrintAsync(new PrintJobRequest
        {
            JobId = 1,
            PrinterName = "Virtual",
            Format = PrintJobFormat.Pdf,
            Payload = Encoding.UTF8.GetBytes("not a pdf"),
            Copies = 1,
            CancellationToken = CancellationToken.None,
        });
        Assert.Equal(PrintStatus.Failed, result.Status);
        Assert.Equal("PDF_INVALID", result.ErrorCode);
    }

    [Fact]
    public async Task HtmlDriver_ReturnsNotImplemented()
    {
        var driver = new HtmlPrintDriver();
        var result = await driver.PrintAsync(new PrintJobRequest
        {
            JobId = 1,
            PrinterName = "Virtual",
            Format = PrintJobFormat.Html,
            Payload = Encoding.UTF8.GetBytes("<html></html>"),
            Copies = 1,
            CancellationToken = CancellationToken.None,
        });
        Assert.Equal(PrintStatus.Failed, result.Status);
        Assert.Equal("HTML_NOT_IMPLEMENTED", result.ErrorCode);
        Assert.Equal("html", result.DriverId);
    }

    [Fact]
    public void PrintResult_Printed_HasFields()
    {
        var r = PrintResult.Printed("pdf", "HP", 2, TimeSpan.FromMilliseconds(12));
        Assert.Equal(PrintStatus.Printed, r.Status);
        Assert.Equal(2, r.Copies);
        Assert.Equal("HP", r.PrinterName);
        Assert.Null(r.ErrorCode);
    }
}
