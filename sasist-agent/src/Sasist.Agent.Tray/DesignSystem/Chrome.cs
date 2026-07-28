namespace Sasist.Agent.Tray;

/// <summary>Page chrome: title + subtitle + body. Used by every screen.</summary>
internal sealed class PageShell : Panel
{
    private readonly SasistTitle _title;
    private readonly SasistSubtitle _desc;
    public Panel Body { get; }

    public PageShell(string title, string description)
    {
        Dock = DockStyle.Fill;
        BackColor = Theme.Background;
        Padding = new Padding(Theme.PagePad);

        var header = new Panel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            BackColor = Color.Transparent,
            Padding = new Padding(0, 0, 0, Theme.Space.Lg),
        };
        _title = new SasistTitle { Text = title };
        _desc = new SasistSubtitle { Text = description };
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
            Padding = new Padding(0, Theme.Space.Xs, Theme.Space.Sm, 0),
        };
        Controls.Add(Body);
        Controls.Add(header);
        Resize += (_, _) => ApplyWidths();
        HandleCreated += (_, _) => ApplyWidths();
    }

    private void ApplyWidths()
    {
        var w = Math.Max(240, ClientSize.Width - Padding.Horizontal - Theme.Space.Xl);
        _title.MaximumSize = new Size(w, 0);
        _desc.MaximumSize = new Size(w, 0);
    }
}

/// <summary>Section card with heading — Settings / Diagnostics blocks.</summary>
internal sealed class SasistSection : SasistCard
{
    private readonly FlowLayoutPanel _body;
    public FlowLayoutPanel Content => _body;

    public SasistSection(string title)
    {
        AutoSize = true;
        AutoSizeMode = AutoSizeMode.GrowAndShrink;
        MinimumSize = new Size(280, 64);
        Margin = new Padding(0, 0, 0, Theme.SectionGap);

        _body = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            BackColor = Color.Transparent,
        };
        var h = new SasistHeading { Text = title, Margin = new Padding(0, 0, 0, Theme.Space.Md) };
        _body.Controls.Add(h);
        Controls.Add(_body);
    }

    public void Add(Control c) => _body.Controls.Add(c);
}

/// <summary>Horizontal action bar — wrap buttons, never overflow.</summary>
internal sealed class SasistToolbar : FlowLayoutPanel
{
    public SasistToolbar()
    {
        Dock = DockStyle.Top;
        AutoSize = true;
        WrapContents = true;
        FlowDirection = FlowDirection.LeftToRight;
        BackColor = Color.Transparent;
        Padding = new Padding(0, 0, 0, Theme.Space.Md);
        Margin = Padding.Empty;
    }

    protected override void OnParentChanged(EventArgs e)
    {
        base.OnParentChanged(e);
        if (Parent is not null)
        {
            Parent.Resize -= ParentOnResize;
            Parent.Resize += ParentOnResize;
            FitToParent();
        }
    }

    private void ParentOnResize(object? sender, EventArgs e) => FitToParent();

    private void FitToParent()
    {
        if (Parent is null || Dock != DockStyle.None) return;
        var w = Math.Max(120, Parent.ClientSize.Width - Margin.Horizontal);
        if (Width != w) Width = w;
    }

    public SasistButton AddButton(string text, SasistButtonKind kind = SasistButtonKind.Secondary, EventHandler? onClick = null)
    {
        var b = new SasistButton { Text = text, Kind = kind };
        if (onClick is not null) b.Click += onClick;
        Controls.Add(b);
        return b;
    }

    public SasistButton AddChip(string text, EventHandler? onClick = null)
    {
        var b = new SasistButton
        {
            Text = text,
            Kind = SasistButtonKind.Ghost,
            MinimumSize = new Size(64, 36),
            Margin = new Padding(0, 0, Theme.Space.Sm, Theme.Space.Sm),
            Padding = new Padding(Theme.Space.Md, Theme.Space.Sm, Theme.Space.Md, Theme.Space.Sm),
        };
        if (onClick is not null) b.Click += onClick;
        Controls.Add(b);
        return b;
    }
}

/// <summary>Search field inside a card chrome.</summary>
internal sealed class SasistSearchBox : SasistCard
{
    public TextBox Input { get; }

    public SasistSearchBox(string placeholder = "Szukaj…")
    {
        AutoSize = true;
        AutoSizeMode = AutoSizeMode.GrowAndShrink;
        Padding = new Padding(Theme.Space.Md, Theme.Space.Sm, Theme.Space.Md, Theme.Space.Sm);
        Margin = new Padding(0, 0, Theme.Space.Sm, Theme.Space.Sm);
        MinimumSize = new Size(220, 36);
        Elevated = false;

        var row = new TableLayoutPanel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            ColumnCount = 2,
            RowCount = 1,
            BackColor = Color.Transparent,
        };
        row.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        row.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
        row.RowStyles.Add(new RowStyle(SizeType.AutoSize));

        var icon = new SasistIcon();
        icon.Set(AppIcons.Search, Theme.FaintText, 14f);
        icon.Margin = new Padding(0, Theme.Space.Xs, Theme.Space.Sm, 0);
        Input = new TextBox
        {
            BorderStyle = BorderStyle.None,
            Font = Theme.Body,
            PlaceholderText = placeholder,
            BackColor = Theme.Surface,
            Dock = DockStyle.Fill,
            MinimumSize = new Size(160, 22),
        };
        row.Controls.Add(icon, 0, 0);
        row.Controls.Add(Input, 1, 0);
        Controls.Add(row);
    }
}

/// <summary>Centered empty tab — never a blank white void.</summary>
internal sealed class SasistEmptyState : SasistCard
{
    private readonly SasistHeading _title;
    private readonly SasistSubtitle _body;

    public SasistEmptyState(string title, string body, string glyph = AppIcons.EmptyBox)
    {
        AutoSize = true;
        AutoSizeMode = AutoSizeMode.GrowAndShrink;
        MinimumSize = new Size(320, 160);
        Margin = new Padding(0, Theme.Space.Lg, 0, 0);
        Elevated = true;

        var stack = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            BackColor = Color.Transparent,
            Padding = new Padding(Theme.Space.Xl, Theme.Space.Xxl, Theme.Space.Xl, Theme.Space.Xxl),
        };

        var icon = new SasistIcon { Margin = new Padding(0, 0, 0, Theme.Space.Lg) };
        icon.Set(glyph, Theme.FaintText, 40f);
        _title = new SasistHeading { Text = title, Margin = new Padding(0, 0, 0, Theme.Space.Sm) };
        _body = new SasistSubtitle { Text = body };
        stack.Controls.Add(icon);
        stack.Controls.Add(_title);
        stack.Controls.Add(_body);
        Controls.Add(stack);
    }

    public void SetCopy(string title, string body)
    {
        _title.Text = title;
        _body.Text = body;
    }
}

internal sealed class SasistProgress : Panel
{
    private readonly ProgressBar _bar;
    private readonly SasistCaption _label;

    public SasistProgress()
    {
        AutoSize = true;
        Dock = DockStyle.Top;
        BackColor = Color.Transparent;
        Visible = false;
        Padding = new Padding(0, Theme.Space.Sm, 0, Theme.Space.Sm);

        _bar = new ProgressBar
        {
            MinimumSize = new Size(160, 8),
            MaximumSize = new Size(420, 8),
            Height = 8,
            Margin = new Padding(0, 0, 0, Theme.Space.Xs),
            Style = ProgressBarStyle.Continuous,
        };
        _label = new SasistCaption { Text = "", Margin = Padding.Empty };
        var stack = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            BackColor = Color.Transparent,
        };
        stack.Controls.Add(_bar);
        stack.Controls.Add(_label);
        Controls.Add(stack);
    }

    public void ShowProgress(string text, int value)
    {
        Visible = true;
        _label.Text = text;
        _bar.Value = Math.Clamp(value, 0, 100);
    }

    public void HideProgress()
    {
        Visible = false;
        _label.Text = "";
        _bar.Value = 0;
    }

    public void FitWidth(int w)
    {
        var barW = Math.Min(420, Math.Max(160, w));
        _bar.MaximumSize = new Size(barW, 8);
        _bar.MinimumSize = new Size(Math.Min(160, barW), 8);
        _bar.Width = barW;
    }
}

internal static class SasistDialog
{
    public static DialogResult Confirm(IWin32Window owner, string message, string title = "Sasist Agent") =>
        MessageBox.Show(owner, message, title, MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button2);

    public static void Info(IWin32Window owner, string message, string title = "Sasist Agent") =>
        MessageBox.Show(owner, message, title, MessageBoxButtons.OK, MessageBoxIcon.Information);

    public static void Warn(IWin32Window owner, string message, string title = "Sasist Agent") =>
        MessageBox.Show(owner, message, title, MessageBoxButtons.OK, MessageBoxIcon.Warning);
}

internal static class SasistNotification
{
    public static void Balloon(NotifyIcon tray, string title, string body, ToolTipIcon icon = ToolTipIcon.Info)
    {
        if (!UiPreferences.Current.Notifications) return;
        tray.ShowBalloonTip(2200, title, body, icon);
    }
}
