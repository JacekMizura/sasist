using Sasist.Agent.Core.Config;

namespace Sasist.Agent.Tray;

internal sealed class PairingPage : UserControl
{
    private readonly ConfigStore _store;
    private readonly Action _onPaired;
    private readonly TextBox _code;
    private readonly SasistSubtitle _status;
    private readonly SasistButton _connect;

    public PairingPage(ConfigStore store, Action onPaired)
    {
        _store = store;
        _onPaired = onPaired;
        Dock = DockStyle.Fill;
        BackColor = Theme.Background;
        Padding = new Padding(Theme.PagePad);

        var host = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 3,
            RowCount = 3,
            BackColor = Color.Transparent,
        };
        host.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50f));
        host.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        host.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50f));
        host.RowStyles.Add(new RowStyle(SizeType.Percent, 50f));
        host.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        host.RowStyles.Add(new RowStyle(SizeType.Percent, 50f));

        var card = new SasistCard
        {
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            Margin = Padding.Empty,
            Padding = new Padding(Theme.Space.Xxl),
            MinimumSize = new Size(360, 280),
            MaximumSize = new Size(520, 0),
        };

        var stack = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            BackColor = Color.Transparent,
        };

        var brandRow = new FlowLayoutPanel
        {
            AutoSize = true,
            WrapContents = false,
            BackColor = Color.Transparent,
            Margin = new Padding(0, 0, 0, Theme.Space.Lg),
        };
        brandRow.Controls.Add(new PictureBox
        {
            Image = Branding.MarkImage,
            SizeMode = PictureBoxSizeMode.Zoom,
            MinimumSize = new Size(32, 32),
            MaximumSize = new Size(32, 32),
            Margin = new Padding(0, 0, Theme.Space.Md, 0),
        });
        brandRow.Controls.Add(new SasistHeading { Text = "Sasist Agent", Margin = Padding.Empty });

        var title = new SasistTitle { Text = "Połącz z Sasist", MaximumSize = new Size(440, 0) };
        var sub = new SasistSubtitle
        {
            Text = "Wklej kod połączenia z panelu Sasist, aby zacząć drukować.",
            MaximumSize = new Size(440, 0),
            Margin = new Padding(0, 0, 0, Theme.Space.Lg),
        };
        var codeLbl = new SasistCaption { Text = "Kod połączenia", Margin = new Padding(0, 0, 0, Theme.Space.Sm) };

        var inputCard = new SasistCard
        {
            AutoSize = true,
            Elevated = false,
            Padding = new Padding(Theme.Space.Md, Theme.Space.Md, Theme.Space.Md, Theme.Space.Md),
            Margin = new Padding(0, 0, 0, Theme.Space.Md),
            MinimumSize = new Size(280, 40),
        };
        _code = new TextBox
        {
            BorderStyle = BorderStyle.None,
            Font = Theme.Body,
            PlaceholderText = "Wklej kod tutaj",
            BackColor = Theme.Surface,
            Dock = DockStyle.Top,
            MinimumSize = new Size(240, 22),
        };
        inputCard.Controls.Add(_code);

        _connect = new SasistButton { Text = "Połącz", Kind = SasistButtonKind.Primary, Margin = new Padding(0, Theme.Space.Xs, 0, Theme.Space.Md) };
        _connect.Click += async (_, _) => await ConnectAsync();
        _status = new SasistSubtitle { Text = "", MaximumSize = new Size(440, 0) };

        stack.Controls.Add(brandRow);
        stack.Controls.Add(title);
        stack.Controls.Add(sub);
        stack.Controls.Add(codeLbl);
        stack.Controls.Add(inputCard);
        stack.Controls.Add(_connect);
        stack.Controls.Add(_status);
        card.Controls.Add(stack);

        host.Controls.Add(card, 1, 1);
        Controls.Add(host);
        Resize += (_, _) =>
        {
            var max = Math.Min(520, Math.Max(320, ClientSize.Width - Theme.Space.Xxxl));
            card.MaximumSize = new Size(max, 0);
            inputCard.MaximumSize = new Size(Math.Max(240, max - 56), 0);
            title.MaximumSize = new Size(max - 56, 0);
            sub.MaximumSize = new Size(max - 56, 0);
            _status.MaximumSize = new Size(max - 56, 0);
        };
    }

    private async Task ConnectAsync()
    {
        var code = _code.Text.Trim();
        if (string.IsNullOrWhiteSpace(code))
        {
            _status.ForeColor = Theme.Danger;
            _status.Text = UserMessages.EnterPairingCode;
            return;
        }

        _connect.Enabled = false;
        _status.ForeColor = Theme.MutedText;
        _status.Text = UserMessages.Connecting;

        try
        {
            var cfg = _store.Load();
            cfg.EnsureCloudUrl();
            cfg.ApiKey = code;
            if (string.IsNullOrWhiteSpace(cfg.MachineId))
                cfg.MachineId = $"{Environment.MachineName}-{Environment.TickCount:X8}";
            cfg.ComputerName = Environment.MachineName;
            _store.Save(cfg);

            var result = await PairingClient.PairAsync(cfg, code, CancellationToken.None);
            cfg.Token = result.Token;
            cfg.AgentId = result.AgentId;
            cfg.OrganizationName = result.OrganizationName;
            if (result.WarehouseId is int wh)
                cfg.WarehouseId = wh;
            _store.Save(cfg);

            AgentStatusStore.Write(new AgentStatusSnapshot
            {
                Online = false,
                DeviceCount = 0,
                OrganizationName = cfg.OrganizationName,
            });

            try
            {
                try { ServiceHelper.Restart(TrayApplicationContext.ServiceName); }
                catch { ServiceHelper.StartIfNeeded(TrayApplicationContext.ServiceName); }
            }
            catch
            {
                _status.ForeColor = Theme.Warning;
                _status.Text = UserMessages.ServiceStartHint;
                _onPaired();
                return;
            }

            _status.ForeColor = Theme.Success;
            _status.Text = UserMessages.Connected;
            await Task.Delay(450);
            _onPaired();
        }
        catch (Exception ex)
        {
            _status.ForeColor = Theme.Danger;
            _status.Text = UserMessages.FromException(ex);
        }
        finally
        {
            _connect.Enabled = true;
        }
    }
}
