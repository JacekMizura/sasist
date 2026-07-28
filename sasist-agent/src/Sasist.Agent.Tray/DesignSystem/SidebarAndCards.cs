using System.Drawing.Drawing2D;
using System.Drawing.Text;
using Sasist.Agent.Core.Config;
using Sasist.Agent.Tray.Mvp;

namespace Sasist.Agent.Tray;

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
        Margin = new Padding(0, 0, 0, Theme.Space.Xs);
        TabStop = true;
        AutoSize = true;
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
    }

    private int PreferredHeight()
    {
        var th = TextRenderer.MeasureText("Ag", Theme.Nav).Height;
        return Math.Max(44, th + Theme.Space.Lg);
    }

    public override Size GetPreferredSize(Size proposedSize)
    {
        var textW = LayoutHelpers.MeasureTextWidth(Text, Theme.Nav);
        var w = proposedSize.Width > 0
            ? proposedSize.Width
            : Math.Max(160, Theme.Space.Lg + 28 + Theme.Space.Md + textW + Theme.Space.Lg);
        return new Size(w, PreferredHeight());
    }

    protected override void SetBoundsCore(int x, int y, int width, int height, BoundsSpecified specified)
    {
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
        var r = new Rectangle(Theme.Space.Xs, 2, Math.Max(8, Width - Theme.Space.Sm), Height - Theme.Space.Xs);
        var bg = _active ? Theme.Selected : _hover ? Theme.Hover : Color.Transparent;
        using (var path = Theme.RoundRect(r, Theme.NavRadius))
        using (var b = new SolidBrush(bg))
            e.Graphics.FillPath(b, path);

        if (_active)
        {
            using var accent = new SolidBrush(Theme.Primary);
            e.Graphics.FillRectangle(accent, new Rectangle(r.X, r.Y + Theme.Space.Sm, 3, r.Height - Theme.Space.Lg));
        }

        var iconC = _active ? Theme.PrimaryText : Theme.MutedText;
        var textC = _active ? Theme.PrimaryText : Theme.SecondaryText;
        TextRenderer.DrawText(e.Graphics, IconGlyph, AppIcons.Lg, new Rectangle(r.X + Theme.Space.Md, r.Y, 28, r.Height), iconC,
            TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
        TextRenderer.DrawText(e.Graphics, Text, Theme.Nav, new Rectangle(r.X + 44, r.Y, Math.Max(40, r.Width - 56), r.Height), textC,
            TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPrefix | TextFormatFlags.NoPadding);
    }
}

/// <summary>App sidebar — brand, nav table, footer. Width from longest label.</summary>
internal sealed class SasistSidebar : Panel
{
    private readonly TableLayoutPanel _navHost;
    private readonly Dictionary<string, SasistNavItem> _nav = new();
    private readonly SasistCaption _footerOrg;
    private readonly SasistHint _footerVer;
    public IReadOnlyDictionary<string, SasistNavItem> Items => _nav;
    public event Action<string>? Navigated;

    public SasistSidebar((string Id, string Label, string Icon)[] items)
    {
        Dock = DockStyle.Left;
        Width = Theme.SidebarMinWidth;
        MinimumSize = new Size(Theme.SidebarMinWidth, 0);
        BackColor = Theme.Surface;
        Paint += (_, e) =>
        {
            using var pen = new Pen(Theme.Border);
            e.Graphics.DrawLine(pen, Width - 1, 0, Width - 1, Height);
        };

        var brand = BuildBrand();
        _navHost = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            AutoScroll = true,
            Padding = new Padding(Theme.Space.Md, Theme.Space.Xs, Theme.Space.Md, Theme.Space.Sm),
            BackColor = Color.Transparent,
            GrowStyle = TableLayoutPanelGrowStyle.FixedSize,
        };
        _navHost.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
        _navHost.RowCount = items.Length;
        for (var i = 0; i < items.Length; i++)
        {
            var it = items[i];
            _navHost.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            var btn = new SasistNavItem
            {
                PageId = it.Id,
                Text = it.Label,
                IconGlyph = it.Icon,
                AccessibleName = it.Label,
                Dock = DockStyle.Fill,
                Margin = new Padding(0, 0, 0, Theme.Space.Xs),
            };
            var id = it.Id;
            btn.Click += (_, _) => Navigated?.Invoke(id);
            _navHost.Controls.Add(btn, 0, i);
            _nav[it.Id] = btn;
        }

        var footer = new Panel { Dock = DockStyle.Bottom, AutoSize = true, Padding = new Padding(Theme.Space.Lg, Theme.Space.Md, Theme.Space.Md, Theme.Space.Lg) };
        footer.Paint += (_, e) =>
        {
            using var pen = new Pen(Theme.Border);
            e.Graphics.DrawLine(pen, Theme.Space.Md, 0, Math.Max(Theme.Space.Md, footer.Width - Theme.Space.Md), 0);
        };
        var footerStack = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            BackColor = Color.Transparent,
            Padding = new Padding(0, Theme.Space.Sm, 0, 0),
        };
        footerStack.Controls.Add(new SasistHint { Text = "Połączono z:", Margin = new Padding(0, 0, 0, Theme.Space.Xs) });
        _footerOrg = new SasistCaption { Text = "—", Font = Theme.BodySemibold, ForeColor = Theme.Text, Margin = new Padding(0, 0, 0, Theme.Space.Xs) };
        _footerVer = new SasistHint { Text = $"v{AgentConfig.AgentVersion}" };
        footerStack.Controls.Add(_footerOrg);
        footerStack.Controls.Add(_footerVer);
        footer.Controls.Add(footerStack);
        footer.Resize += (_, _) =>
        {
            _footerOrg.MaximumSize = new Size(Math.Max(80, footer.ClientSize.Width - footer.Padding.Horizontal), 0);
        };

        Controls.Add(_navHost);
        Controls.Add(footer);
        Controls.Add(brand);
    }

    public void FitWidth((string Id, string Label, string Icon)[] items)
    {
        var maxLabel = 0;
        foreach (var it in items)
            maxLabel = Math.Max(maxLabel, LayoutHelpers.MeasureTextWidth(it.Label, Theme.Nav));
        var itemW = Math.Max(160, Theme.Space.Lg + 28 + Theme.Space.Md + maxLabel + Theme.Space.Lg);
        var need = _navHost.Padding.Horizontal + itemW;
        if (Width != need)
            Width = Math.Max(Theme.SidebarMinWidth, need);
    }

    public void SetActive(string id)
    {
        foreach (var (k, v) in _nav) v.Active = k == id;
    }

    public void SetEnabled(bool enabled)
    {
        foreach (var n in _nav.Values) n.Enabled = enabled;
    }

    public void SetFooter(string company, string version)
    {
        if (_footerOrg.Text != company) _footerOrg.Text = company;
        if (_footerVer.Text != version) _footerVer.Text = version;
    }

    private static Panel BuildBrand()
    {
        var brand = new Panel { Dock = DockStyle.Top, AutoSize = true, Padding = new Padding(Theme.Space.Lg, Theme.Space.Lg, Theme.Space.Md, Theme.Space.Md) };
        var brandRow = new TableLayoutPanel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            ColumnCount = 2,
            RowCount = 1,
            BackColor = Color.Transparent,
        };
        brandRow.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        brandRow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
        brandRow.RowStyles.Add(new RowStyle(SizeType.AutoSize));

        var brandLogo = new PictureBox
        {
            Image = Branding.MarkImage,
            SizeMode = PictureBoxSizeMode.Zoom,
            Dock = DockStyle.Fill,
            Margin = new Padding(0, Theme.Space.Xs, 0, Theme.Space.Xs),
            MinimumSize = new Size(28, 28),
            MaximumSize = new Size(32, 32),
        };
        var brandStack = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            AutoSize = true,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            Padding = new Padding(Theme.Space.Sm, 0, 0, 0),
            BackColor = Color.Transparent,
        };
        brandStack.Controls.Add(new SasistHeading { Text = "Sasist", Margin = new Padding(0, 0, 0, Theme.Space.Xs) });
        brandStack.Controls.Add(new SasistHint { Text = "Agent" });
        brandRow.Controls.Add(brandLogo, 0, 0);
        brandRow.Controls.Add(brandStack, 1, 0);
        brand.Controls.Add(brandRow);
        return brand;
    }
}

/// <summary>Device printer card — one implementation for Devices page.</summary>
internal sealed class SasistPrinterCard : SasistCard
{
    private readonly SasistBody _name;
    private readonly SasistStatusBadge _status;
    private readonly SasistBadge _def;
    private readonly string _printerName;

    public SasistPrinterCard(PrinterRow p)
    {
        _printerName = p.Name;
            AutoSize = true;
            AutoSizeMode = AutoSizeMode.GrowAndShrink;
            MinimumSize = new Size(280, 200);
            Margin = new Padding(0, 0, Theme.Gap, Theme.Gap);
            Padding = new Padding(Theme.CardPad, Theme.CardPad, Theme.CardPad, Theme.CardPad + Theme.Space.Sm);

        var stack = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            BackColor = Color.Transparent,
        };

        var titleRow = new FlowLayoutPanel
        {
            AutoSize = true,
            WrapContents = true,
            BackColor = Color.Transparent,
            Margin = new Padding(0, 0, 0, Theme.Space.Sm),
        };
        var icon = new SasistIcon();
        icon.Set(AppIcons.Print, Theme.Primary, 18f);
        titleRow.Controls.Add(icon);
        _name = new SasistBody { Text = p.Name, Font = Theme.BodySemibold, MaximumSize = new Size(300, 0) };
        titleRow.Controls.Add(_name);
        stack.Controls.Add(titleRow);
        stack.Controls.Add(new SasistCaption { Text = "Drukarka systemowa Windows", Margin = new Padding(0, 0, 0, Theme.Space.Sm) });

        _status = new SasistStatusBadge { Margin = new Padding(0, Theme.Space.Sm, 0, Theme.Space.Xs) };
        stack.Controls.Add(_status);
        _def = new SasistBadge { Text = "Domyślna", Tone = SasistBadgeTone.Primary, Margin = new Padding(0, 0, 0, Theme.Space.Sm) };
        stack.Controls.Add(_def);

        var actions = new SasistToolbar { Dock = DockStyle.None, Padding = new Padding(0, Theme.Space.Md, 0, 0) };
        var test = actions.AddButton("Druk testowy", SasistButtonKind.Primary);
        test.Click += (_, _) => RunTest(_printerName);
        var details = actions.AddButton("Szczegóły", SasistButtonKind.Secondary);
        details.Click += (_, _) => SasistDialog.Info(FindForm()!, $"Drukarka: {_printerName}\nStatus: {_status.Text}", "Szczegóły");
        stack.Controls.Add(actions);
        Controls.Add(stack);
        Update(p);
    }

    public void ApplyContentWidth(int cardW)
    {
        _name.MaximumSize = new Size(Math.Max(80, cardW - 56), 0);
        MaximumSize = new Size(cardW, 0);
    }

    public void Update(PrinterRow p)
    {
        if (_name.Text != p.Name) { _name.Text = p.Name; UiMetrics.NoteValueUpdate(); }
        _status.SetReady(p.Status == "Gotowa");
        _def.Visible = p.IsDefault;
    }

    private static void RunTest(string name)
    {
        try
        {
            LocalPrinters.PrintTestPage(name);
            JobHistoryStore.Append($"test-{DateTime.Now:HHmmss}", name, "Wydrukowano");
            SasistDialog.Info(Form.ActiveForm!, "Wysłano wydruk testowy.", "Druk testowy");
        }
        catch (Exception ex)
        {
            JobHistoryStore.Append($"test-{DateTime.Now:HHmmss}", name, "Błąd", ex.Message);
            SasistDialog.Warn(Form.ActiveForm!, UserMessages.PrintFailed, "Druk testowy");
        }
    }
}

/// <summary>Key/value diagnostic row card.</summary>
internal sealed class SasistDiagnosticCard : SasistCard
{
    private readonly Dictionary<string, SasistBody> _values = new();

    public SasistDiagnosticCard(string title, (string Key, string Label)[] rows)
    {
        AutoSize = true;
        AutoSizeMode = AutoSizeMode.GrowAndShrink;
        MinimumSize = new Size(260, 80);
        Margin = new Padding(0, 0, Theme.Gap, Theme.Gap);

        var stack = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            BackColor = Color.Transparent,
        };
        stack.Controls.Add(new SasistHeading { Text = title, Margin = new Padding(0, 0, 0, Theme.Space.Md) });

        foreach (var (key, label) in rows)
        {
            var row = new FlowLayoutPanel
            {
                AutoSize = true,
                FlowDirection = FlowDirection.TopDown,
                WrapContents = false,
                BackColor = Color.Transparent,
                Margin = new Padding(0, 0, 0, Theme.Space.Md),
            };
            row.Controls.Add(new SasistCaption { Text = label, Margin = new Padding(0, 0, 0, Theme.Space.Xs) });
            var val = new SasistBody { Text = "—", Font = Theme.BodySemibold, MaximumSize = new Size(360, 0) };
            row.Controls.Add(val);
            stack.Controls.Add(row);
            _values[key] = val;
        }
        Controls.Add(stack);
    }

    public void Set(string key, string value)
    {
        if (!_values.TryGetValue(key, out var lbl)) return;
        UiBuffering.SetTextIfChanged(lbl, value);
    }

    public void FitWidth(int w)
    {
        MaximumSize = new Size(w, 0);
        MinimumSize = new Size(Math.Min(260, w), 80);
        foreach (var v in _values.Values)
            v.MaximumSize = new Size(Math.Max(80, w - 56), 0);
    }
}

/// <summary>Status metric tile on home grid.</summary>
internal sealed class SasistMetricCard : SasistCard
{
    public SasistMetric ValueLabel { get; }
    public SasistCaption HintLabel { get; }

    public SasistMetricCard(string icon, string title, Action? open = null)
    {
        Dock = DockStyle.Fill;
        AutoSize = true;
        AutoSizeMode = AutoSizeMode.GrowAndShrink;
        MinimumSize = new Size(200, 100);

        var stack = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            BackColor = Color.Transparent,
        };

        var head = new FlowLayoutPanel
        {
            AutoSize = true,
            WrapContents = false,
            FlowDirection = FlowDirection.LeftToRight,
            BackColor = Color.Transparent,
            Margin = new Padding(0, 0, 0, Theme.Space.Md),
        };
        var ic = new SasistIcon();
        ic.Set(icon, Theme.Primary, 16f);
        head.Controls.Add(ic);
        head.Controls.Add(new SasistCaption { Text = title, Font = Theme.CaptionBold, ForeColor = Theme.MutedText });

        ValueLabel = new SasistMetric { Text = "—", MaximumSize = new Size(280, 0), Margin = new Padding(0, 0, 0, Theme.Space.Sm) };
        HintLabel = new SasistCaption { Text = "", MaximumSize = new Size(280, 0) };

        if (open is not null)
        {
            Cursor = Cursors.Hand;
            void go(object? s, EventArgs e) => open();
            Click += go;
            ValueLabel.Click += go;
            HintLabel.Click += go;
            head.Click += go;
        }

        stack.Controls.Add(head);
        stack.Controls.Add(ValueLabel);
        stack.Controls.Add(HintLabel);
        Controls.Add(stack);
    }

    public void FitText(int max)
    {
        ValueLabel.MaximumSize = new Size(max, 0);
        HintLabel.MaximumSize = new Size(max, 0);
    }
}
