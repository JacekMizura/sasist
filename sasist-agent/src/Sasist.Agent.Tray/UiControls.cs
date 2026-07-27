using System.Drawing.Drawing2D;

namespace Sasist.Agent.Tray;

internal sealed class RoundedCard : Panel
{
    public int CornerRadius { get; set; } = 12;
    public bool DrawShadow { get; set; } = true;

    public RoundedCard()
    {
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
        DoubleBuffered = true;
        Padding = new Padding(20);
        BackColor = Color.Transparent;
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        var rect = ClientRectangle;
        rect.Inflate(-1, -1);
        if (DrawShadow)
        {
            var shadow = rect;
            shadow.Offset(0, 2);
            using var shadowPath = Theme.RoundRect(shadow, CornerRadius);
            using var shadowBrush = new SolidBrush(Color.FromArgb(Theme.Mode == AppThemeMode.Dark ? 40 : 16, 0, 0, 0));
            e.Graphics.FillPath(shadowBrush, shadowPath);
        }

        using var path = Theme.RoundRect(rect, CornerRadius);
        using var fill = new SolidBrush(Theme.CardBg);
        using var border = new Pen(Theme.CardBorder);
        e.Graphics.FillPath(fill, path);
        e.Graphics.DrawPath(border, path);
    }
}

internal sealed class ModernButton : Button
{
    private bool _hover;
    public bool Primary { get; set; }
    public bool Danger { get; set; }
    public bool Ghost { get; set; }

    public ModernButton()
    {
        FlatStyle = FlatStyle.Flat;
        FlatAppearance.BorderSize = 0;
        Cursor = Cursors.Hand;
        Height = 36;
        Font = Theme.FontUiSemibold;
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer, true);
        ApplyColors();
        Theme.Changed += OnThemeChanged;
    }

    private void OnThemeChanged() => ApplyColors();

    protected override void Dispose(bool disposing)
    {
        if (disposing) Theme.Changed -= OnThemeChanged;
        base.Dispose(disposing);
    }

    public void ApplyColors()
    {
        if (Primary)
        {
            BackColor = _hover ? Theme.AccentHover : Theme.Accent;
            ForeColor = Color.White;
        }
        else if (Danger)
        {
            BackColor = _hover ? Color.FromArgb(185, 28, 28) : Theme.Danger;
            ForeColor = Color.White;
        }
        else if (Ghost)
        {
            BackColor = _hover ? Theme.NavHover : Color.Transparent;
            ForeColor = Theme.TextPrimary;
        }
        else
        {
            BackColor = _hover ? Theme.NavHover : Theme.InputBg;
            ForeColor = Theme.TextPrimary;
        }
        Invalidate();
    }

    protected override void OnMouseEnter(EventArgs e) { _hover = true; ApplyColors(); base.OnMouseEnter(e); }
    protected override void OnMouseLeave(EventArgs e) { _hover = false; ApplyColors(); base.OnMouseLeave(e); }

    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        var rect = ClientRectangle;
        rect.Inflate(-1, -1);
        using var path = Theme.RoundRect(rect, 8);
        using var brush = new SolidBrush(BackColor);
        e.Graphics.FillPath(brush, path);
        if (!Primary && !Danger && !Ghost)
        {
            using var pen = new Pen(Theme.CardBorder);
            e.Graphics.DrawPath(pen, path);
        }
        TextRenderer.DrawText(
            e.Graphics,
            Text,
            Font,
            rect,
            ForeColor,
            TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
    }
}

internal sealed class NavItemButton : Control
{
    private bool _hover;
    private bool _active;
    public string IconGlyph { get; set; } = "";
    public string PageId { get; set; } = "";

    public bool Active
    {
        get => _active;
        set { _active = value; Invalidate(); }
    }

    public NavItemButton()
    {
        Height = 40;
        Cursor = Cursors.Hand;
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.SupportsTransparentBackColor, true);
        Theme.Changed += OnThemeChanged;
    }

    private void OnThemeChanged() => Invalidate();

    protected override void Dispose(bool disposing)
    {
        if (disposing) Theme.Changed -= OnThemeChanged;
        base.Dispose(disposing);
    }

    protected override void OnMouseEnter(EventArgs e) { _hover = true; Invalidate(); base.OnMouseEnter(e); }
    protected override void OnMouseLeave(EventArgs e) { _hover = false; Invalidate(); base.OnMouseLeave(e); }

    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        var bg = _active ? Theme.NavActiveBg : _hover ? Theme.NavHover : Color.Transparent;
        var rect = new Rectangle(8, 2, Width - 16, Height - 4);
        using (var path = Theme.RoundRect(rect, 8))
        using (var brush = new SolidBrush(bg))
            e.Graphics.FillPath(brush, path);

        if (_active)
        {
            using var accent = new SolidBrush(Theme.Accent);
            e.Graphics.FillRectangle(accent, new Rectangle(8, 10, 3, Height - 20));
        }

        var iconColor = _active ? Theme.Accent : Theme.TextSecondary;
        var textColor = _active ? Theme.TextPrimary : Theme.TextSecondary;
        TextRenderer.DrawText(e.Graphics, IconGlyph, AppIcons.Font, new Rectangle(20, 0, 28, Height), iconColor,
            TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
        TextRenderer.DrawText(e.Graphics, Text, Theme.FontUiSemibold, new Rectangle(48, 0, Width - 56, Height), textColor,
            TextFormatFlags.Left | TextFormatFlags.VerticalCenter);
    }
}

internal sealed class ModernTextBox : Panel
{
    private readonly TextBox _inner;
    public TextBox Inner => _inner;
    public override string Text
    {
        get => _inner.Text ?? "";
        set => _inner.Text = value ?? "";
    }
    public string PlaceholderText { get => _inner.PlaceholderText; set => _inner.PlaceholderText = value; }

    public ModernTextBox()
    {
        Height = 40;
        Padding = new Padding(12, 8, 12, 8);
        _inner = new TextBox
        {
            BorderStyle = BorderStyle.None,
            Dock = DockStyle.Fill,
            Font = Theme.FontUi,
        };
        Controls.Add(_inner);
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer, true);
        ApplyTheme();
        Theme.Changed += ApplyTheme;
        _inner.GotFocus += (_, _) => Invalidate();
        _inner.LostFocus += (_, _) => Invalidate();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) Theme.Changed -= ApplyTheme;
        base.Dispose(disposing);
    }

    private void ApplyTheme()
    {
        BackColor = Color.Transparent;
        _inner.BackColor = Theme.InputBg;
        _inner.ForeColor = Theme.TextPrimary;
        Invalidate();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        var rect = ClientRectangle;
        rect.Inflate(-1, -1);
        using var path = Theme.RoundRect(rect, 10);
        using var fill = new SolidBrush(Theme.InputBg);
        using var border = new Pen(_inner.Focused ? Theme.Accent : Theme.CardBorder, _inner.Focused ? 1.5f : 1f);
        e.Graphics.FillPath(fill, path);
        e.Graphics.DrawPath(border, path);
    }
}

internal sealed class PageHeader : Panel
{
    private readonly Label _title;
    private readonly Label _subtitle;

    public PageHeader(string title, string subtitle = "")
    {
        Height = 64;
        Dock = DockStyle.Top;
        BackColor = Color.Transparent;
        _title = new Label
        {
            Text = title,
            AutoSize = false,
            Left = 0,
            Top = 4,
            Width = 700,
            Height = 32,
            Font = Theme.FontTitle,
        };
        _subtitle = new Label
        {
            Text = subtitle,
            AutoSize = false,
            Left = 0,
            Top = 36,
            Width = 700,
            Height = 22,
            Font = Theme.FontCaption,
        };
        Controls.Add(_title);
        Controls.Add(_subtitle);
        ApplyTheme();
        Theme.Changed += ApplyTheme;
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) Theme.Changed -= ApplyTheme;
        base.Dispose(disposing);
    }

    private void ApplyTheme()
    {
        _title.ForeColor = Theme.TextPrimary;
        _subtitle.ForeColor = Theme.TextSecondary;
        _title.Font = Theme.FontTitle;
    }
}

internal static class UiFactory
{
    public static Label Caption(string text) => new()
    {
        Text = text,
        AutoSize = true,
        Font = Theme.FontCaption,
        ForeColor = Theme.TextMuted,
    };

    public static Label Value(string text, float size = 12f) => new()
    {
        Text = text,
        AutoSize = true,
        Font = new Font("Segoe UI Semibold", size),
        ForeColor = Theme.TextPrimary,
    };
}
