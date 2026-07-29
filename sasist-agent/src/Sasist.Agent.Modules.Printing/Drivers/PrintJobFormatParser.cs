namespace Sasist.Agent.Modules.Printing.Drivers;

public static class PrintJobFormatParser
{
    public static bool TryParse(string? token, out PrintJobFormat format)
    {
        format = PrintJobFormat.Pdf;
        if (string.IsNullOrWhiteSpace(token))
            return false;

        switch (token.Trim().ToLowerInvariant())
        {
            case "pdf":
                format = PrintJobFormat.Pdf;
                return true;
            case "zpl":
            case "raw_zpl":
                format = PrintJobFormat.Zpl;
                return true;
            case "epl":
            case "raw_epl":
                format = PrintJobFormat.Epl;
                return true;
            case "escpos":
            case "esc_pos":
            case "esc-pos":
                format = PrintJobFormat.EscPos;
                return true;
            case "pcl":
                format = PrintJobFormat.Pcl;
                return true;
            case "ps":
            case "postscript":
                format = PrintJobFormat.PostScript;
                return true;
            case "raw":
                format = PrintJobFormat.Raw;
                return true;
            case "html":
                format = PrintJobFormat.Html;
                return true;
            case "image":
            case "png":
            case "jpeg":
            case "jpg":
            case "bmp":
                format = PrintJobFormat.Image;
                return true;
            default:
                return false;
        }
    }

    public static string ToToken(PrintJobFormat format) => format switch
    {
        PrintJobFormat.Pdf => "pdf",
        PrintJobFormat.Zpl => "zpl",
        PrintJobFormat.Epl => "epl",
        PrintJobFormat.EscPos => "escpos",
        PrintJobFormat.Pcl => "pcl",
        PrintJobFormat.PostScript => "postscript",
        PrintJobFormat.Raw => "raw",
        PrintJobFormat.Html => "html",
        PrintJobFormat.Image => "image",
        _ => "pdf",
    };

    /// <summary>Formats that are native printer languages and may use WindowsRawSpooler.</summary>
    public static bool IsNativePrinterLanguage(PrintJobFormat format) => format switch
    {
        PrintJobFormat.Zpl or
            PrintJobFormat.Epl or
            PrintJobFormat.EscPos or
            PrintJobFormat.Pcl or
            PrintJobFormat.PostScript or
            PrintJobFormat.Raw => true,
        _ => false,
    };
}
