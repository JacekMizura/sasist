using System.Drawing.Imaging;

namespace Sasist.Agent.Tray;

internal static class Branding
{
    private static Icon? _appIcon;
    private static Image? _mark;

    public static Icon AppIcon => _appIcon ??= LoadIcon();
    public static Image MarkImage => _mark ??= LoadMark();

    private static Icon LoadIcon()
    {
        var ico = Path.Combine(AppContext.BaseDirectory, "assets", "sasist-agent.ico");
        if (File.Exists(ico))
            return new Icon(ico);

        // Embedded fallback: paint orange hexagon into icon
        using var bmp = new Bitmap(32, 32);
        using (var g = Graphics.FromImage(bmp))
        {
            g.Clear(Color.Transparent);
            g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
            using var brush = new SolidBrush(Color.FromArgb(249, 115, 22));
            var pts = HexagonPoints(16, 16, 14);
            g.FillPolygon(brush, pts);
            using var white = new SolidBrush(Color.White);
            g.FillRectangle(white, 12, 10, 8, 12);
        }
        return Icon.FromHandle(bmp.GetHicon());
    }

    private static Image LoadMark()
    {
        var png = Path.Combine(AppContext.BaseDirectory, "assets", "sasist-mark.png");
        if (File.Exists(png))
            return Image.FromFile(png);

        var bmp = new Bitmap(64, 64);
        using var g = Graphics.FromImage(bmp);
        g.Clear(Color.Transparent);
        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        using var brush = new SolidBrush(Color.FromArgb(249, 115, 22));
        g.FillPolygon(brush, HexagonPoints(32, 32, 28));
        return bmp;
    }

    private static PointF[] HexagonPoints(float cx, float cy, float r)
    {
        var pts = new PointF[6];
        for (var i = 0; i < 6; i++)
        {
            var a = Math.PI / 180 * (60 * i - 90);
            pts[i] = new PointF(cx + r * (float)Math.Cos(a), cy + r * (float)Math.Sin(a));
        }
        return pts;
    }
}
