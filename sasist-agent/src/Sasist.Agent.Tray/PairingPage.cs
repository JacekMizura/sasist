using Sasist.Agent.Core.Config;

namespace Sasist.Agent.Tray;

/// <summary>Full-window first-run / reconnect pairing.</summary>
internal sealed class PairingPage : UserControl
{
    private readonly ConfigStore _store;
    private readonly Action _onPaired;
    private readonly TextBox _codeBox;
    private readonly Label _status;
    private readonly Button _connect;

    public PairingPage(ConfigStore store, Action onPaired)
    {
        _store = store;
        _onPaired = onPaired;
        Dock = DockStyle.Fill;
        BackColor = Color.FromArgb(245, 246, 248);

        var card = TrayUi.CreateCard(0, 0, 480, 380);
        card.Anchor = AnchorStyles.None;
        card.Left = 40;
        card.Top = 40;

        var logo = new PictureBox
        {
            Image = Branding.MarkImage,
            SizeMode = PictureBoxSizeMode.Zoom,
            Left = 28,
            Top = 24,
            Width = 40,
            Height = 40,
        };
        var brand = new Label
        {
            Text = "Sasist Agent",
            Left = 80,
            Top = 28,
            Width = 340,
            Height = 28,
            Font = new Font("Segoe UI Semibold", 14f),
        };
        var title = new Label
        {
            Text = "Połącz z Sasist",
            Left = 28,
            Top = 84,
            Width = 420,
            Height = 32,
            Font = new Font("Segoe UI Semibold", 18f),
        };
        var subtitle = new Label
        {
            Text = "Wklej kod połączenia z panelu Sasist, aby zacząć drukować.",
            Left = 28,
            Top = 124,
            Width = 420,
            Height = 40,
            ForeColor = Color.FromArgb(90, 90, 98),
        };
        var codeLabel = new Label
        {
            Text = "Kod połączenia",
            Left = 28,
            Top = 176,
            Width = 420,
            Height = 22,
            Font = new Font("Segoe UI Semibold", 9.5f),
        };
        _codeBox = new TextBox
        {
            Left = 28,
            Top = 202,
            Width = 420,
            Height = 36,
            Font = new Font("Segoe UI", 12f),
            PlaceholderText = "Wklej kod tutaj",
            BorderStyle = BorderStyle.FixedSingle,
        };
        _connect = new Button
        {
            Text = "Połącz",
            Left = 28,
            Top = 256,
            Width = 420,
            Height = 44,
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(249, 115, 22),
            ForeColor = Color.White,
            Font = new Font("Segoe UI Semibold", 12f),
            Cursor = Cursors.Hand,
        };
        _connect.FlatAppearance.BorderSize = 0;
        _connect.Click += async (_, _) => await ConnectAsync();

        _status = new Label
        {
            Left = 28,
            Top = 316,
            Width = 420,
            Height = 40,
            ForeColor = Color.FromArgb(100, 100, 110),
        };

        card.Controls.AddRange([logo, brand, title, subtitle, codeLabel, _codeBox, _connect, _status]);
        Controls.Add(card);

        Resize += (_, _) =>
        {
            card.Left = Math.Max(20, (Width - card.Width) / 2);
            card.Top = Math.Max(20, (Height - card.Height) / 2 - 20);
        };
    }

    private async Task ConnectAsync()
    {
        var code = _codeBox.Text.Trim();
        if (string.IsNullOrWhiteSpace(code))
        {
            _status.ForeColor = Color.FromArgb(180, 40, 40);
            _status.Text = UserMessages.EnterPairingCode;
            return;
        }

        _connect.Enabled = false;
        _status.ForeColor = Color.FromArgb(100, 100, 110);
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
                _status.ForeColor = Color.FromArgb(160, 100, 20);
                _status.Text = UserMessages.ServiceStartHint;
                _onPaired();
                return;
            }

            _status.ForeColor = Color.FromArgb(30, 130, 60);
            _status.Text = UserMessages.Connected;
            await Task.Delay(500);
            _onPaired();
        }
        catch (Exception ex)
        {
            _status.ForeColor = Color.FromArgb(180, 40, 40);
            _status.Text = UserMessages.FromException(ex);
        }
        finally
        {
            _connect.Enabled = true;
        }
    }
}
