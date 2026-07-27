using System.Text;
using Sasist.Agent.Modules.Printing.Drivers;

namespace Sasist.Agent.Tests;

public class PrintDriverTests
{
    [Theory]
    [InlineData("pdf", PrintJobFormat.Pdf)]
    [InlineData("zpl", PrintJobFormat.Zpl)]
    [InlineData("raw_zpl", PrintJobFormat.Zpl)]
    [InlineData("raw", PrintJobFormat.Raw)]
    [InlineData("html", PrintJobFormat.Html)]
    public void FormatParser_RecognizesTokens(string token, PrintJobFormat expected)
    {
        Assert.True(PrintJobFormatParser.TryParse(token, out var format));
        Assert.Equal(expected, format);
    }

    [Fact]
    public void Resolver_ExposesAllFormats()
    {
        var resolver = new PrintDriverResolver();
        Assert.Contains("pdf", resolver.SupportedFormatTokens);
        Assert.Contains("zpl", resolver.SupportedFormatTokens);
        Assert.Contains("raw", resolver.SupportedFormatTokens);
        Assert.Contains("html", resolver.SupportedFormatTokens);
        Assert.Equal("zpl", resolver.Resolve(PrintJobFormat.Zpl).DriverId);
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
