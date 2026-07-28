using System.Drawing.Drawing2D;
using System.Drawing.Text;

namespace Sasist.Agent.Tray;

/// <summary>Typography — sparse Bold, clear hierarchy.</summary>
internal sealed class SasistTitle : Label
{
    public SasistTitle()
    {
        AutoSize = true;
        Font = Theme.Display;
        ForeColor = Theme.Text;
        BackColor = Color.Transparent;
        Margin = new Padding(0, 0, 0, Theme.Space.Sm);
        UseMnemonic = false;
    }
}

internal sealed class SasistSubtitle : Label
{
    public SasistSubtitle()
    {
        AutoSize = true;
        Font = Theme.Subtitle;
        ForeColor = Theme.SecondaryText;
        BackColor = Color.Transparent;
        Margin = Padding.Empty;
        UseMnemonic = false;
    }
}

internal sealed class SasistHeading : Label
{
    public SasistHeading()
    {
        AutoSize = true;
        Font = Theme.Heading;
        ForeColor = Theme.Text;
        BackColor = Color.Transparent;
        Margin = new Padding(0, 0, 0, Theme.Space.Md);
        UseMnemonic = false;
    }
}

internal sealed class SasistBody : Label
{
    public SasistBody()
    {
        AutoSize = true;
        Font = Theme.Body;
        ForeColor = Theme.Text;
        BackColor = Color.Transparent;
        UseMnemonic = false;
    }
}

internal sealed class SasistCaption : Label
{
    public SasistCaption()
    {
        AutoSize = true;
        Font = Theme.Caption;
        ForeColor = Theme.MutedText;
        BackColor = Color.Transparent;
        UseMnemonic = false;
    }
}

internal sealed class SasistHint : Label
{
    public SasistHint()
    {
        AutoSize = true;
        Font = Theme.Hint;
        ForeColor = Theme.FaintText;
        BackColor = Color.Transparent;
        UseMnemonic = false;
    }
}

internal sealed class SasistMetric : Label
{
    public SasistMetric()
    {
        AutoSize = true;
        Font = Theme.Title;
        ForeColor = Theme.Text;
        BackColor = Color.Transparent;
        UseMnemonic = false;
    }
}

internal sealed class SasistIcon : Label
{
    public SasistIcon()
    {
        AutoSize = true;
        Font = AppIcons.Lg;
        ForeColor = Theme.Primary;
        BackColor = Color.Transparent;
        Margin = new Padding(0, 0, Theme.Space.Sm, 0);
        TextAlign = ContentAlignment.MiddleCenter;
        UseMnemonic = false;
    }

    public void Set(string glyph, Color color, float size = 18f)
    {
        Text = glyph;
        ForeColor = color;
        Font = AppIcons.Create(size);
    }
}

internal sealed class SasistDivider : Panel
{
    public SasistDivider()
    {
        Height = 1;
        MinimumSize = new Size(40, 1);
        MaximumSize = new Size(int.MaxValue, 1);
        Dock = DockStyle.Top;
        Margin = new Padding(0, Theme.Space.Md, 0, Theme.Space.Md);
        BackColor = Theme.Border;
    }
}

internal enum SasistBadgeTone { Neutral, Primary, Success, Warning, Danger, Info }

internal class SasistBadge : Control
{
    private string _text = "";
    private SasistBadgeTone _tone = SasistBadgeTone.Neutral;

    public SasistBadge()
    {
        AutoSize = true;
        MinimumSize = new Size(52, 28);
        Margin = new Padding(0, 0, Theme.Space.Sm, 0);
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
    }

    public new string Text
    {
        get => _text;
        set { _text = value ?? ""; Invalidate(); PerformLayout(); }
    }

    public SasistBadgeTone Tone
    {
        get => _tone;
        set { _tone = value; Invalidate(); }
    }

    public override Size GetPreferredSize(Size proposedSize)
    {
        var sz = TextRenderer.MeasureText(_text, Theme.Caption);
        return new Size(Math.Max(MinimumSize.Width, sz.Width + Theme.Space.Lg), Math.Max(28, MinimumSize.Height));
    }

    protected override void SetBoundsCore(int x, int y, int width, int height, BoundsSpecified specified)
    {
        var pref = GetPreferredSize(Size.Empty);
        width = Math.Max(pref.Width, width);
        height = pref.Height;
        base.SetBoundsCore(x, y, width, height, specified | BoundsSpecified.Size);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        e.Graphics.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
        var (bg, fg) = ToneColors(_tone);
        var r = ClientRectangle;
        r.Inflate(-1, -1);
        using var path = Theme.RoundRect(r, Theme.BadgeRadius);
        using var brush = new SolidBrush(bg);
        e.Graphics.FillPath(brush, path);
        TextRenderer.DrawText(e.Graphics, _text, Theme.Caption, r, fg,
            TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPrefix);
    }

    protected static (Color Bg, Color Fg) ToneColors(SasistBadgeTone tone) => tone switch
    {
        SasistBadgeTone.Primary => (Theme.PrimarySoft, Theme.PrimaryText),
        SasistBadgeTone.Success => (Theme.SuccessSoft, Theme.Success),
        SasistBadgeTone.Warning => (Theme.WarningSoft, Theme.Warning),
        SasistBadgeTone.Danger => (Theme.DangerSoft, Theme.Danger),
        SasistBadgeTone.Info => (Theme.InfoSoft, Theme.Info),
        _ => (Theme.SurfaceMuted, Theme.SecondaryText),
    };
}

/// <summary>Connection status as a soft pill — never an error banner.</summary>
internal sealed class SasistStatusBadge : SasistBadge
{
    public void SetOnline(bool online)
    {
        Text = online ? "●  Połączono" : "●  Brak połączenia";
        Tone = online ? SasistBadgeTone.Success : SasistBadgeTone.Danger;
    }

    public void SetPairing()
    {
        Text = "●  Parowanie";
        Tone = SasistBadgeTone.Primary;
    }

    public void SetReady(bool ready)
    {
        Text = ready ? "●  Gotowa" : "●  Niedostępna";
        Tone = ready ? SasistBadgeTone.Success : SasistBadgeTone.Danger;
    }

    public void SetStatus(string status, bool ok)
    {
        Text = status;
        Tone = ok ? SasistBadgeTone.Success : SasistBadgeTone.Danger;
    }
}
