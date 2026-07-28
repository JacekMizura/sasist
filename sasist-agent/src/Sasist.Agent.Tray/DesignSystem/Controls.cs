using System.Drawing.Drawing2D;
using System.Drawing.Text;

namespace Sasist.Agent.Tray;

internal enum SasistButtonKind { Primary, Secondary, Ghost, Danger }

internal class SasistButton : Button
{
    private bool _hover;
    private SasistButtonKind _kind = SasistButtonKind.Secondary;

    public SasistButtonKind Kind
    {
        get => _kind;
        set { _kind = value; Invalidate(); }
    }

    /// <summary>Legacy: maps to Primary / Danger / Secondary.</summary>
    public bool Primary
    {
        get => _kind == SasistButtonKind.Primary;
        set { if (value) Kind = SasistButtonKind.Primary; else if (_kind == SasistButtonKind.Primary) Kind = SasistButtonKind.Secondary; }
    }

    public bool Danger
    {
        get => _kind == SasistButtonKind.Danger;
        set { if (value) Kind = SasistButtonKind.Danger; else if (_kind == SasistButtonKind.Danger) Kind = SasistButtonKind.Secondary; }
    }

    public SasistButton()
    {
        FlatStyle = FlatStyle.Flat;
        FlatAppearance.BorderSize = 0;
        Cursor = Cursors.Hand;
        Font = Theme.BodySemibold;
        AutoSize = true;
        AutoSizeMode = AutoSizeMode.GrowAndShrink;
        Padding = new Padding(Theme.Space.Lg, Theme.Space.Sm + 2, Theme.Space.Lg, Theme.Space.Sm + 2);
        MinimumSize = new Size(96, Theme.ButtonHeight);
        Margin = new Padding(0, 0, Theme.Space.Sm, Theme.Space.Sm);
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
        var drawBorder = false;
        switch (_kind)
        {
            case SasistButtonKind.Primary:
                bg = _hover ? Theme.PrimaryHover : Theme.Primary;
                fg = Color.White;
                break;
            case SasistButtonKind.Danger:
                bg = _hover ? Theme.DangerHover : Theme.Danger;
                fg = Color.White;
                break;
        // Prefer opaque fill for secondary too — transparent + PrintWindow = ghosting.
        case SasistButtonKind.Ghost:
            bg = _hover ? Theme.Hover : Theme.SurfaceMuted;
            fg = Theme.SecondaryText;
            drawBorder = true;
            break;
            default:
                bg = _hover ? Theme.Hover : Theme.Surface;
                fg = Theme.SecondaryText;
                drawBorder = true;
                break;
        }

        using var path = Theme.RoundRect(r, Theme.ControlRadius);
        using var brush = new SolidBrush(bg);
        e.Graphics.FillPath(brush, path);
        if (drawBorder)
        {
            using var pen = new Pen(Theme.Border);
            e.Graphics.DrawPath(pen, path);
        }
        TextRenderer.DrawText(e.Graphics, Text, Font, r, fg,
            TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPrefix | TextFormatFlags.SingleLine | TextFormatFlags.EndEllipsis);
    }
}

internal sealed class SasistIconButton : Control
{
    private bool _hover;
    public string Glyph { get; set; } = AppIcons.Refresh;
    public event EventHandler? Clicked;

    public SasistIconButton()
    {
        Cursor = Cursors.Hand;
        MinimumSize = new Size(Theme.IconButtonSize, Theme.IconButtonSize);
        MaximumSize = new Size(Theme.IconButtonSize, Theme.IconButtonSize);
        Size = new Size(Theme.IconButtonSize, Theme.IconButtonSize);
        Margin = new Padding(0, 0, Theme.Space.Sm, 0);
        TabStop = true;
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
    }

    protected override void OnMouseEnter(EventArgs e) { _hover = true; Invalidate(); base.OnMouseEnter(e); }
    protected override void OnMouseLeave(EventArgs e) { _hover = false; Invalidate(); base.OnMouseLeave(e); }
    protected override void OnClick(EventArgs e) { Clicked?.Invoke(this, e); base.OnClick(e); }

    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        e.Graphics.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
        var r = ClientRectangle;
        r.Inflate(-1, -1);
        if (_hover)
        {
            using var path = Theme.RoundRect(r, Theme.ControlRadius);
            using var b = new SolidBrush(Theme.Hover);
            e.Graphics.FillPath(b, path);
        }
        TextRenderer.DrawText(e.Graphics, Glyph, AppIcons.Lg, r, Theme.SecondaryText,
            TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
    }
}

internal class SasistCard : Panel
{
    public bool Elevated { get; set; } = true;
    public bool Selected { get; set; }

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
        var innerW = Math.Max(40, maxW - Padding.Horizontal);
        var inner = new Size(innerW, 0);

        var w = MinimumSize.Width;
        var h = Padding.Vertical;
        var stacked = Controls.Count == 1
            || Controls.Cast<Control>().All(c => c.Dock is DockStyle.Top or DockStyle.Bottom or DockStyle.None);

        if (stacked && Controls.Count >= 1)
        {
            // Vertical stack: sum child heights (cards never clip their own buttons).
            foreach (Control child in Controls)
            {
                if (!child.Visible) continue;
                var pref = child.GetPreferredSize(inner);
                w = Math.Max(w, Math.Min(maxW, pref.Width + Padding.Horizontal + child.Margin.Horizontal));
                h += pref.Height + child.Margin.Vertical;
            }
            h = Math.Max(h, MinimumSize.Height);
        }
        else
        {
            h = MinimumSize.Height;
            foreach (Control child in Controls)
            {
                var pref = child.GetPreferredSize(inner);
                w = Math.Max(w, Math.Min(maxW, pref.Width + Padding.Horizontal + child.Margin.Horizontal));
                h = Math.Max(h, pref.Height + Padding.Vertical + child.Margin.Vertical);
            }
        }

        // Breathing room so primary actions never kiss the border.
        h += Theme.Space.Xs;
        if (MaximumSize.Width > 0) w = Math.Min(w, MaximumSize.Width);
        if (MaximumSize.Height > 0) h = Math.Min(h, MaximumSize.Height);
        return new Size(Math.Max(w, MinimumSize.Width), h);
    }

    protected override void OnLayout(LayoutEventArgs levent)
    {
        base.OnLayout(levent);
        if (!AutoSize || !IsHandleCreated) return;
        var pref = GetPreferredSize(new Size(Width > 0 ? Width : MinimumSize.Width, 0));
        if (Height < pref.Height)
            Height = pref.Height;
        if (Width > 0 && Width < pref.Width && MaximumSize.Width == 0)
            Width = pref.Width;
    }

    protected override void OnPaint(PaintEventArgs e) => Theme.DrawCard(e.Graphics, ClientRectangle, Elevated, Selected);
}

/// <summary>Switch track — label lives beside it via SasistSection / row layouts.</summary>
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
        MinimumSize = new Size(48, 32);
        MaximumSize = new Size(48, 32);
        Size = new Size(48, 32);
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
        using var trackBrush = new SolidBrush(_on ? Theme.Primary : (_hover ? Theme.BorderStrong : Theme.Border));
        e.Graphics.FillPath(trackBrush, trackPath);
        var knobX = _on ? track.Right - 22 : track.Left + 2;
        using var knobBrush = new SolidBrush(Color.White);
        e.Graphics.FillEllipse(knobBrush, new Rectangle(knobX, track.Top + 2, 20, 20));
    }
}
