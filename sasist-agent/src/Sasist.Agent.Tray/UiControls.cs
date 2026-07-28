using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.Text;

namespace Sasist.Agent.Tray;

/// <summary>
/// Layout foundation helpers. Rules:
/// - PerMonitorV2 + AutoScaleMode.None (never double-scale)
/// - Labels: AutoSize=true; wrap via MaximumSize — never AutoSize=false + fixed Width for primary text
/// - No Location/Point positioning
/// - Prefer Dock / FlowLayoutPanel / TableLayoutPanel (AutoSize rows)
/// </summary>
internal static class LayoutHelpers
{
    public static Label Icon(string glyph, Color color, float size = 18f) => new()
    {
        Text = glyph,
        AutoSize = true,
        Font = AppIcons.Create(size),
        ForeColor = color,
        BackColor = Color.Transparent,
        Margin = new Padding(0, 0, 10, 0),
        TextAlign = ContentAlignment.MiddleLeft,
        UseMnemonic = false,
    };

    public static Label Text(string text, Font font, Color color) => new()
    {
        Text = text,
        AutoSize = true,
        Font = font,
        ForeColor = color,
        BackColor = Color.Transparent,
        Margin = Padding.Empty,
        UseMnemonic = false,
    };

    public static Label Muted(string text) => Text(text, Theme.FontCaption, Theme.TextMuted);
    public static Label Title(string text) => Text(text, Theme.FontSection, Theme.TextPrimary);
    public static Label Metric(string text, Color? color = null) => Text(text, Theme.FontMetric, color ?? Theme.TextPrimary);

    /// <summary>Wrapping label for table/flow cells — AutoSize with max width updated by parent.</summary>
    public static Label Wrap(string text, Font font, Color color, int maxWidth = 400) => new()
    {
        Text = text,
        AutoSize = true,
        Font = font,
        ForeColor = color,
        BackColor = Color.Transparent,
        MaximumSize = new Size(Math.Max(80, maxWidth), 0),
        Margin = Padding.Empty,
        UseMnemonic = false,
    };

    public static void SetMaxWidth(Control c, int maxWidth)
    {
        if (c is Label { AutoSize: true } lbl)
            lbl.MaximumSize = new Size(Math.Max(80, maxWidth), 0);
    }

    public static int MeasureTextWidth(string text, Font font)
    {
        var sz = TextRenderer.MeasureText(text, font, new Size(int.MaxValue, int.MaxValue),
            TextFormatFlags.NoPrefix | TextFormatFlags.SingleLine | TextFormatFlags.NoPadding);
        return sz.Width;
    }
}

/// <summary>Walks the control tree and reports clipped / overlapping layout defects.</summary>
internal static class LayoutAuditor
{
    public sealed record Issue(string Path, string Kind, string Detail);

    public static List<Issue> Audit(Control root)
    {
        var issues = new List<Issue>();
        Walk(root, root.Name ?? root.GetType().Name, issues);
        return issues;
    }

    private static void Walk(Control c, string path, List<Issue> issues)
    {
        if (!c.Visible) return;

        if (c is Label lbl && !string.IsNullOrEmpty(lbl.Text) && lbl.Width > 0 && lbl.Height > 0)
        {
            var flags = TextFormatFlags.NoPrefix | TextFormatFlags.TextBoxControl;
            if (lbl.AutoSize)
                flags |= TextFormatFlags.WordBreak;
            else
                flags |= TextFormatFlags.SingleLine;

            var needed = TextRenderer.MeasureText(lbl.Text, lbl.Font,
                lbl.AutoSize ? new Size(Math.Max(1, lbl.MaximumSize.Width > 0 ? lbl.MaximumSize.Width : lbl.Width), int.MaxValue) : lbl.Size,
                flags);

            // Preferable: AutoSize labels should fit their measured size.
            if (lbl.AutoSize)
            {
                if (needed.Width > lbl.Width + 2 && (lbl.MaximumSize.Width == 0 || needed.Width > lbl.MaximumSize.Width + 2))
                    issues.Add(new Issue(path, "clip-width", $"need {needed.Width}px, have {lbl.Width}px: \"{Trim(lbl.Text)}\""));
                if (needed.Height > lbl.Height + 4 && lbl.MaximumSize.Height > 0)
                    issues.Add(new Issue(path, "clip-height", $"need {needed.Height}px, have {lbl.Height}px: \"{Trim(lbl.Text)}\""));
            }
            else if (!lbl.AutoEllipsis)
            {
                if (needed.Width > lbl.ClientSize.Width + 2)
                    issues.Add(new Issue(path, "clip-width", $"need {needed.Width}px, have {lbl.ClientSize.Width}px: \"{Trim(lbl.Text)}\""));
                if (needed.Height > lbl.ClientSize.Height + 4)
                    issues.Add(new Issue(path, "clip-height", $"need {needed.Height}px, have {lbl.ClientSize.Height}px: \"{Trim(lbl.Text)}\""));
            }
            // AutoEllipsis=true is intentional truncation for secondary meta — not a defect.
        }

        // Child clipped by parent client area (common AutoSize failure).
        if (c.Parent is { } parent && c.Visible && parent is not Form)
        {
            var pr = parent.DisplayRectangle;
            if (c.Bottom > pr.Bottom + 2 && c.Height > 8 && parent.Height > 0)
                issues.Add(new Issue(path, "clip-parent", $"child bottom {c.Bottom} > parent {pr.Bottom} ({c.GetType().Name})"));
        }

        // Sibling overlap: skip TableLayoutPanel children (cells are positioned by the table engine).
        if (c.HasChildren && c.Controls.Count > 1 && c is not TableLayoutPanel)
        {
            var kids = c.Controls.Cast<Control>().Where(x => x.Visible).ToList();
            for (var i = 0; i < kids.Count; i++)
            for (var j = i + 1; j < kids.Count; j++)
            {
                var a = kids[i];
                var b = kids[j];
                if (a.Dock != DockStyle.None || b.Dock != DockStyle.None) continue;
                var inter = Rectangle.Intersect(a.Bounds, b.Bounds);
                if (inter.Width > 4 && inter.Height > 4)
                {
                    issues.Add(new Issue(path, "overlap",
                        $"{a.GetType().Name}∩{b.GetType().Name} {inter.Width}x{inter.Height}"));
                }
            }
        }

        foreach (Control child in c.Controls)
            Walk(child, path + "/" + (string.IsNullOrEmpty(child.Name) ? child.GetType().Name : child.Name), issues);
    }

    private static string Trim(string s) => s.Length <= 40 ? s : s[..37] + "…";

    public static string FormatReport(IReadOnlyList<Issue> issues)
    {
        if (issues.Count == 0) return "OK — no clip/overlap defects";
        var sb = new StringBuilder();
        sb.AppendLine($"FAIL — {issues.Count} issue(s):");
        foreach (var i in issues.Take(40))
            sb.AppendLine($"  [{i.Kind}] {i.Path}: {i.Detail}");
        if (issues.Count > 40) sb.AppendLine($"  … +{issues.Count - 40} more");
        return sb.ToString();
    }
}

internal class SasistCard : Panel
{
    public SasistCard()
    {
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
        DoubleBuffered = true;
        BackColor = Color.Transparent;
        Padding = new Padding(Theme.CardPad);
        Margin = new Padding(0, 0, Theme.Gap, Theme.Gap);
        AutoSizeMode = AutoSizeMode.GrowAndShrink;
    }

    public override Size GetPreferredSize(Size proposedSize)
    {
        if (!AutoSize || Controls.Count == 0)
            return base.GetPreferredSize(proposedSize);

        var maxW = MaximumSize.Width > 0 ? MaximumSize.Width : (proposedSize.Width > 0 ? proposedSize.Width : int.MaxValue);
        var inner = new Size(Math.Max(40, maxW - Padding.Horizontal), 0);

        var w = MinimumSize.Width;
        var h = MinimumSize.Height;
        foreach (Control child in Controls)
        {
            var pref = child.GetPreferredSize(inner);
            w = Math.Max(w, Math.Min(maxW, pref.Width + Padding.Horizontal + child.Margin.Horizontal));
            h = Math.Max(h, pref.Height + Padding.Vertical + child.Margin.Vertical);
        }
        if (MaximumSize.Width > 0) w = Math.Min(w, MaximumSize.Width);
        if (MaximumSize.Height > 0) h = Math.Min(h, MaximumSize.Height);
        return new Size(w, h);
    }

    protected override void OnPaint(PaintEventArgs e) => Theme.DrawCard(e.Graphics, ClientRectangle, elevated: true);
}

internal sealed class SasistButton : Button
{
    private bool _hover;
    public bool Primary { get; set; }
    public bool Danger { get; set; }

    public SasistButton()
    {
        FlatStyle = FlatStyle.Flat;
        FlatAppearance.BorderSize = 0;
        Cursor = Cursors.Hand;
        Font = Theme.FontBodySemibold;
        AutoSize = true;
        AutoSizeMode = AutoSizeMode.GrowAndShrink;
        Padding = new Padding(16, 8, 16, 8);
        MinimumSize = new Size(96, Theme.ButtonHeight);
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
    }

    public override Size GetPreferredSize(Size proposedSize)
    {
        var constraint = proposedSize.Width > 0 ? proposedSize.Width : 600;
        var textSize = TextRenderer.MeasureText(Text, Font, new Size(constraint, int.MaxValue),
            TextFormatFlags.NoPrefix | TextFormatFlags.WordBreak);
        var w = Math.Max(MinimumSize.Width, textSize.Width + Padding.Horizontal + 4);
        var h = Math.Max(MinimumSize.Height, textSize.Height + Padding.Vertical);
        return new Size(w, h);
    }

    protected override void OnMouseEnter(EventArgs e) { _hover = true; Invalidate(); base.OnMouseEnter(e); }
    protected override void OnMouseLeave(EventArgs e) { _hover = false; Invalidate(); base.OnMouseLeave(e); }

    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        e.Graphics.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
        var r = ClientRectangle;
        r.Inflate(-1, -1);
        Color bg, fg;
        if (Primary) { bg = _hover ? Theme.AccentHover : Theme.Accent; fg = Color.White; }
        else if (Danger) { bg = _hover ? Color.FromArgb(0xBE, 0x12, 0x3C) : Theme.Danger; fg = Color.White; }
        else { bg = _hover ? Theme.SurfaceMuted : Theme.Surface; fg = Theme.TextSecondary; }

        using var path = Theme.RoundRect(r, Theme.ControlRadius);
        using var brush = new SolidBrush(bg);
        e.Graphics.FillPath(brush, path);
        if (!Primary && !Danger)
        {
            using var pen = new Pen(Theme.Border);
            e.Graphics.DrawPath(pen, path);
        }
        TextRenderer.DrawText(e.Graphics, Text, Font, r, fg,
            TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPrefix | TextFormatFlags.WordBreak);
    }
}

internal sealed class SasistNavItem : Control
{
    private bool _hover;
    private bool _active;
    public string IconGlyph { get; set; } = "";
    public string PageId { get; set; } = "";
    public bool Active { get => _active; set { _active = value; Invalidate(); } }

    public SasistNavItem()
    {
        Cursor = Cursors.Hand;
        Margin = new Padding(0, 0, 0, 4);
        TabStop = true;
        AutoSize = true;
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
    }

    private int PreferredHeight()
    {
        var th = TextRenderer.MeasureText("Ag", Theme.FontNav).Height;
        return Math.Max(44, th + 16);
    }

    /// <summary>Width from longest label drives sidebar; height from font metrics.</summary>
    public override Size GetPreferredSize(Size proposedSize)
    {
        var textW = LayoutHelpers.MeasureTextWidth(Text, Theme.FontNav);
        var w = proposedSize.Width > 0
            ? proposedSize.Width
            : Math.Max(160, 16 + 28 + 12 + textW + 16);
        return new Size(w, PreferredHeight());
    }

    protected override void SetBoundsCore(int x, int y, int width, int height, BoundsSpecified specified)
    {
        // Intrinsic height from font; width comes from table cell.
        height = PreferredHeight();
        base.SetBoundsCore(x, y, width, height, specified | BoundsSpecified.Height);
    }

    protected override void OnMouseEnter(EventArgs e) { _hover = true; Invalidate(); base.OnMouseEnter(e); }
    protected override void OnMouseLeave(EventArgs e) { _hover = false; Invalidate(); base.OnMouseLeave(e); }
    protected override void OnTextChanged(EventArgs e)
    {
        if (AutoSize) PerformLayout();
        Invalidate();
        base.OnTextChanged(e);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        e.Graphics.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
        var r = new Rectangle(4, 2, Math.Max(8, Width - 8), Height - 4);
        var bg = _active ? Theme.AccentSoft : _hover ? Theme.SurfaceMuted : Color.Transparent;
        using (var path = Theme.RoundRect(r, Theme.NavRadius))
        using (var b = new SolidBrush(bg))
            e.Graphics.FillPath(b, path);

        if (_active)
        {
            using var accent = new SolidBrush(Theme.Accent);
            e.Graphics.FillRectangle(accent, new Rectangle(r.X, r.Y + 8, 3, r.Height - 16));
        }

        var iconC = _active ? Theme.AccentText : Theme.TextMuted;
        var textC = _active ? Theme.AccentText : Theme.TextSecondary;
        TextRenderer.DrawText(e.Graphics, IconGlyph, AppIcons.Lg, new Rectangle(r.X + 12, r.Y, 28, r.Height), iconC,
            TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
        // No EndEllipsis — parent must give enough width (sidebar measured from longest label).
        TextRenderer.DrawText(e.Graphics, Text, Theme.FontNav, new Rectangle(r.X + 44, r.Y, Math.Max(40, r.Width - 56), r.Height), textC,
            TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPrefix | TextFormatFlags.NoPadding);
    }
}

/// <summary>Switch-only control (label lives in a separate AutoSize Label).</summary>
internal sealed class SasistToggle : Control
{
    private bool _on;
    private bool _hover;
    public event EventHandler? Toggled;

    public bool On
    {
        get => _on;
        set { _on = value; Invalidate(); }
    }

    public SasistToggle()
    {
        Size = new Size(48, 32);
        MinimumSize = new Size(48, 32);
        Cursor = Cursors.Hand;
        DoubleBuffered = true;
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
    }

    protected override void OnMouseEnter(EventArgs e) { _hover = true; Invalidate(); base.OnMouseEnter(e); }
    protected override void OnMouseLeave(EventArgs e) { _hover = false; Invalidate(); base.OnMouseLeave(e); }
    protected override void OnClick(EventArgs e)
    {
        On = !On;
        Toggled?.Invoke(this, EventArgs.Empty);
        base.OnClick(e);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        const int trackW = 44, trackH = 24;
        var track = new Rectangle(Math.Max(0, (Width - trackW) / 2), Math.Max(0, (Height - trackH) / 2), trackW, trackH);
        using var trackPath = Theme.RoundRect(track, 12);
        using var trackBrush = new SolidBrush(_on ? Theme.Accent : (_hover ? Theme.BorderStrong : Theme.Border));
        e.Graphics.FillPath(trackBrush, trackPath);
        var knobX = _on ? track.Right - 22 : track.Left + 2;
        using var knobBrush = new SolidBrush(Color.White);
        e.Graphics.FillEllipse(knobBrush, new Rectangle(knobX, track.Top + 2, 20, 20));
    }
}

internal sealed class PageShell : Panel
{
    private readonly Label _title;
    private readonly Label _desc;
    public Panel Body { get; }

    public PageShell(string title, string description)
    {
        Dock = DockStyle.Fill;
        BackColor = Theme.Canvas;
        Padding = new Padding(Theme.PagePad);

        var header = new Panel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            BackColor = Color.Transparent,
            Padding = new Padding(0, 0, 0, 16),
        };
        _title = new Label
        {
            Text = title,
            AutoSize = true,
            Font = Theme.FontPageTitle,
            ForeColor = Theme.TextPrimary,
            BackColor = Color.Transparent,
            Margin = new Padding(0, 0, 0, 6),
        };
        _desc = new Label
        {
            Text = description,
            AutoSize = true,
            Font = Theme.FontBody,
            ForeColor = Theme.TextDesc,
            BackColor = Color.Transparent,
        };
        var stack = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            BackColor = Color.Transparent,
        };
        stack.Controls.Add(_title);
        stack.Controls.Add(_desc);
        header.Controls.Add(stack);

        Body = new Panel
        {
            Dock = DockStyle.Fill,
            AutoScroll = true,
            BackColor = Color.Transparent,
            Padding = new Padding(0, 4, 8, 0),
        };
        Controls.Add(Body);
        Controls.Add(header);
        Resize += (_, _) => ApplyWidths();
        HandleCreated += (_, _) => ApplyWidths();
    }

    private void ApplyWidths()
    {
        var w = Math.Max(240, ClientSize.Width - Padding.Horizontal - 24);
        _title.MaximumSize = new Size(w, 0);
        _desc.MaximumSize = new Size(w, 0);
    }
}
