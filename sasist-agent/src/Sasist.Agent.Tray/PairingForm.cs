using Sasist.Agent.Core.Config;

namespace Sasist.Agent.Tray;

/// <summary>First-run pairing — Dropbox/TeamViewer-style. No Server URL.</summary>
internal sealed class PairingForm : Form
{
    private readonly ConfigStore _store;
    private readonly TextBox _codeBox;
    private readonly Label _status;
    private readonly Button _connect;
    private readonly Panel _card;

    public PairingForm(ConfigStore store)
    {
        _store = store;

        Text = "Sasist Agent";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(480, 420);
        BackColor = Color.FromArgb(250, 250, 252);
        Font = new Font("Segoe UI", 10f);
        Icon = Branding.AppIcon;

        _card = new Panel
        {
            Left = 24,
            Top = 24,
            Width = 432,
            Height = 372,
            BackColor = Color.White,
        };
        // soft border
        _card.Paint += (_, e) =>
        {
            using var pen = new Pen(Color.FromArgb(230, 230, 235));
            e.Graphics.DrawRectangle(pen, 0, 0, _card.Width - 1, _card.Height - 1);
        };

        var logo = new PictureBox
        {
            Image = Branding.MarkImage,
            SizeMode = PictureBoxSizeMode.Zoom,
            Left = 24,
            Top = 20,
            Width = 40,
            Height = 40,
        };

        var title = new Label
        {
            Text = "Sasist Agent",
            Left = 72,
            Top = 18,
            Width = 320,
            Height = 28,
            Font = new Font("Segoe UI Semibold", 16f),
            ForeColor = Color.FromArgb(28, 28, 30),
        };

        var subtitle = new Label
        {
            Text = "Połącz z kontem Sasist",
            Left = 24,
            Top = 72,
            Width = 384,
            Height = 24,
            Font = new Font("Segoe UI", 11f),
            ForeColor = Color.FromArgb(90, 90, 98),
        };

        var codeLabel = new Label
        {
            Text = "Kod parowania",
            Left = 24,
            Top = 112,
            Width = 384,
            Height = 22,
            Font = new Font("Segoe UI Semibold", 9.5f),
            ForeColor = Color.FromArgb(40, 40, 45),
        };

        _codeBox = new TextBox
        {
            Left = 24,
            Top = 138,
            Width = 384,
            Height = 36,
            Font = new Font("Consolas", 11f),
            PlaceholderText = "spa_…",
            BorderStyle = BorderStyle.FixedSingle,
        };

        _connect = new Button
        {
            Text = "Połącz",
            Left = 24,
            Top = 192,
            Width = 384,
            Height = 40,
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(249, 115, 22),
            ForeColor = Color.White,
            Font = new Font("Segoe UI Semibold", 11f),
            Cursor = Cursors.Hand,
        };
        _connect.FlatAppearance.BorderSize = 0;
        _connect.Click += async (_, _) => await ConnectAsync();

        _status = new Label
        {
            Left = 24,
            Top = 244,
            Width = 384,
            Height = 40,
            ForeColor = Color.FromArgb(100, 100, 110),
            Text = "",
        };

        var hint = new Label
        {
            Left = 24,
            Top = 290,
            Width = 384,
            Height = 64,
            ForeColor = Color.FromArgb(120, 120, 130),
            Font = new Font("Segoe UI", 9f),
            Text = "Kod znajdziesz w:\nSasist → Ustawienia → Urządzenia → Dodaj Agenta",
        };

        _card.Controls.AddRange([logo, title, subtitle, codeLabel, _codeBox, _connect, _status, hint]);
        Controls.Add(_card);
        AcceptButton = _connect;
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

            try
            {
                _store.Save(cfg);
            }
            catch (Exception ex)
            {
                _status.ForeColor = Color.FromArgb(180, 40, 40);
                _status.Text = UserMessages.FromException(ex);
                return;
            }

            var result = await PairingClient.PairAsync(cfg, code, CancellationToken.None);
            cfg.Token = result.Token;
            cfg.AgentId = result.AgentId;
            cfg.OrganizationName = result.OrganizationName;
            if (result.WarehouseId is int wh)
                cfg.WarehouseId = wh;

            try
            {
                _store.Save(cfg);
            }
            catch (Exception ex)
            {
                _status.ForeColor = Color.FromArgb(180, 40, 40);
                _status.Text = UserMessages.FromException(ex);
                return;
            }

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
                DialogResult = DialogResult.OK;
                await Task.Delay(1200);
                Close();
                return;
            }

            _status.ForeColor = Color.FromArgb(30, 130, 60);
            _status.Text = UserMessages.Connected;
            DialogResult = DialogResult.OK;
            await Task.Delay(600);
            Close();
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
