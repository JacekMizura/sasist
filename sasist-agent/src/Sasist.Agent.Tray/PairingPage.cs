using Sasist.Agent.Core.Config;

namespace Sasist.Agent.Tray;

internal sealed class PairingPage : UserControl
{
    private readonly ConfigStore _store;
    private readonly Action _onPaired;
    private readonly ModernTextBox _codeBox;
    private readonly Label _status;
    private readonly ModernButton _connect;
    private readonly RoundedCard _card;

    public PairingPage(ConfigStore store, Action onPaired)
    {
        _store = store;
        _onPaired = onPaired;
        Dock = DockStyle.Fill;
        BackColor = Theme.WindowBg;

        _card = new RoundedCard { Width = 460, Height = 420 };

        var logo = new PictureBox
        {
            Image = Branding.MarkImage,
            SizeMode = PictureBoxSizeMode.Zoom,
            Left = 28,
            Top = 28,
            Width = 40,
            Height = 40,
            BackColor = Color.Transparent,
        };
        var brand = new Label
        {
            Text = "Sasist Agent",
            Left = 80,
            Top = 34,
            Width = 320,
            Height = 28,
            Font = new Font("Segoe UI Semibold", 14f),
            ForeColor = Theme.TextPrimary,
            BackColor = Color.Transparent,
        };
        var title = new Label
        {
            Text = "Połącz z Sasist",
            Left = 28,
            Top = 90,
            Width = 400,
            Height = 34,
            Font = new Font("Segoe UI Semibold", 22f),
            ForeColor = Theme.TextPrimary,
            BackColor = Color.Transparent,
        };
        var subtitle = new Label
        {
            Text = "Wklej kod połączenia z panelu Sasist,\naby zacząć drukować na tym komputerze.",
            Left = 28,
            Top = 132,
            Width = 400,
            Height = 48,
            Font = Theme.FontUi,
            ForeColor = Theme.TextSecondary,
            BackColor = Color.Transparent,
        };
        var codeLabel = new Label
        {
            Text = "Kod połączenia",
            Left = 28,
            Top = 196,
            Width = 400,
            Height = 20,
            Font = Theme.FontUiSemibold,
            ForeColor = Theme.TextPrimary,
            BackColor = Color.Transparent,
        };
        _codeBox = new ModernTextBox
        {
            Left = 28,
            Top = 220,
            Width = 400,
            Height = 44,
            PlaceholderText = "Wklej kod tutaj",
        };
        _connect = new ModernButton
        {
            Text = "Połącz",
            Primary = true,
            Left = 28,
            Top = 284,
            Width = 400,
            Height = 44,
        };
        _connect.Click += async (_, _) => await ConnectAsync();
        _status = new Label
        {
            Left = 28,
            Top = 344,
            Width = 400,
            Height = 48,
            Font = Theme.FontUi,
            ForeColor = Theme.TextSecondary,
            BackColor = Color.Transparent,
        };

        _card.Controls.AddRange([logo, brand, title, subtitle, codeLabel, _codeBox, _connect, _status]);
        Controls.Add(_card);
        Resize += (_, _) => CenterCard();
        Theme.Changed += ApplyTheme;
        ApplyTheme();
        CenterCard();
    }

    private void CenterCard()
    {
        _card.Left = Math.Max(24, (Width - _card.Width) / 2);
        _card.Top = Math.Max(24, (Height - _card.Height) / 2 - 12);
    }

    private void ApplyTheme()
    {
        BackColor = Theme.WindowBg;
        foreach (Control c in _card.Controls)
        {
            if (c is Label l)
            {
                if (ReferenceEquals(l, _status)) continue;
                if (l.Font.Size >= 18) l.ForeColor = Theme.TextPrimary;
                else if (l.Text.Contains('\n') || l.Text.StartsWith("Wklej")) l.ForeColor = Theme.TextSecondary;
                else l.ForeColor = Theme.TextPrimary;
            }
        }
        _card.Invalidate();
        _connect.ApplyColors();
    }

    private async Task ConnectAsync()
    {
        var code = _codeBox.Text.Trim();
        if (string.IsNullOrWhiteSpace(code))
        {
            _status.ForeColor = Theme.Danger;
            _status.Text = UserMessages.EnterPairingCode;
            return;
        }

        _connect.Enabled = false;
        _status.ForeColor = Theme.TextSecondary;
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

    protected override void Dispose(bool disposing)
    {
        if (disposing) Theme.Changed -= ApplyTheme;
        base.Dispose(disposing);
    }
}
