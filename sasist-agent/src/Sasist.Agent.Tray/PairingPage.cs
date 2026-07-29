using Sasist.Agent.Core.Config;

namespace Sasist.Agent.Tray;

/// <summary>Full-window onboarding — single card, no nested chrome.</summary>
internal sealed class PairingPage : UserControl
{
    private readonly ConfigStore _store;
    private readonly Action _onPaired;
    private readonly SasistTextField _codeField;
    private readonly SasistSubtitle _status;
    private readonly SasistButton _connect;
    private readonly SasistCard _card;

    public PairingPage(ConfigStore store, Action onPaired)
    {
        _store = store;
        _onPaired = onPaired;
        Dock = DockStyle.Fill;
        BackColor = Theme.Background;
        Padding = new Padding(Theme.Space.Xxxl);

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
        host.RowStyles.Add(new RowStyle(SizeType.Percent, 45f));
        host.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        host.RowStyles.Add(new RowStyle(SizeType.Percent, 55f));

        _card = new SasistCard
        {
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            Margin = Padding.Empty,
            Padding = new Padding(40, 36, 40, 36),
            MinimumSize = new Size(420, 0),
            MaximumSize = new Size(460, 0),
        };

        var stack = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            BackColor = Color.Transparent,
        };

        var mark = new PictureBox
        {
            Image = Branding.MarkImage,
            SizeMode = PictureBoxSizeMode.Zoom,
            MinimumSize = new Size(40, 40),
            MaximumSize = new Size(40, 40),
            Margin = new Padding(0, 0, 0, Theme.Space.Xl),
        };

        var title = new SasistTitle
        {
            Text = "Połącz z Sasist",
            MaximumSize = new Size(380, 0),
            Margin = new Padding(0, 0, 0, Theme.Space.Md),
        };
        var sub = new SasistSubtitle
        {
            Text = "Wklej kod z panelu Sasist (Stanowiska → Sasist Agent).",
            MaximumSize = new Size(380, 0),
            Margin = new Padding(0, 0, 0, Theme.Space.Xxl),
        };
        var codeLbl = new SasistCaption
        {
            Text = "Kod połączenia",
            Margin = new Padding(0, 0, 0, Theme.Space.Sm),
        };

        _codeField = new SasistTextField("np. A8F9-2B4C-X991", AppIcons.Link)
        {
            Width = 380,
            Margin = new Padding(0, 0, 0, Theme.Space.Lg),
        };

        _connect = new SasistButton
        {
            Text = "Połącz urządzenie",
            Kind = SasistButtonKind.Primary,
            FullWidth = true,
            Width = 380,
            Margin = new Padding(0, 0, 0, Theme.Space.Md),
        };
        _connect.Click += async (_, _) => await ConnectAsync();

        _status = new SasistSubtitle
        {
            Text = "",
            MaximumSize = new Size(380, 0),
            Margin = new Padding(0, 0, 0, Theme.Space.Lg),
        };

        var help = new SasistCaption
        {
            Text = "Kod wygenerujesz w panelu: Ustawienia WMS → Stanowiska → zakładka Sasist Agent.",
            MaximumSize = new Size(380, 0),
            ForeColor = Theme.MutedText,
            Margin = new Padding(0, Theme.Space.Sm, 0, 0),
        };

        stack.Controls.Add(mark);
        stack.Controls.Add(title);
        stack.Controls.Add(sub);
        stack.Controls.Add(codeLbl);
        stack.Controls.Add(_codeField);
        stack.Controls.Add(_connect);
        stack.Controls.Add(_status);
        stack.Controls.Add(help);
        _card.Controls.Add(stack);

        host.Controls.Add(_card, 1, 1);
        Controls.Add(host);
        Resize += (_, _) => FitCard();
        HandleCreated += (_, _) => FitCard();
    }

    private void FitCard()
    {
        var max = Math.Min(460, Math.Max(360, ClientSize.Width - Theme.Space.Xxxl * 2));
        _card.MaximumSize = new Size(max, 0);
        var inner = Math.Max(280, max - 80);
        _codeField.Width = inner;
        _connect.Width = inner;
        _connect.MinimumSize = new Size(inner, Theme.ButtonHeight);
    }

    private async Task ConnectAsync()
    {
        var code = _codeField.Value.Trim().Replace(" ", "", StringComparison.Ordinal);
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
            // Pairing code is single-use Bearer for Tray register only — never persist as ApiKey.
            // (Persisting it made Host re-POST the spent code → 401 → crash before heartbeat.)
            if (string.IsNullOrWhiteSpace(cfg.MachineId))
                cfg.MachineId = $"{Environment.MachineName}-{Environment.TickCount:X8}";
            cfg.ComputerName = Environment.MachineName;
            _store.Save(cfg);

            PairingDiag.Log($"pair_start server={cfg.ServerUrl} machine_id={cfg.MachineId} code_len={code.Length} code_shape=ok");
            var result = await PairingClient.PairAsync(cfg, code, CancellationToken.None);
            PairingDiag.Log($"pair_ok agent_id={result.AgentId} warehouse_id={result.WarehouseId?.ToString() ?? "null"} org_len={result.OrganizationName?.Length ?? 0}");

            // Clear any leftover pairing code from older builds; Host must run token-only.
            cfg.ApiKey = "";
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
                PairingDiag.Log("host_service_start_ok");
            }
            catch (Exception svcEx)
            {
                PairingDiag.Log($"host_service_start_fail: {svcEx.GetType().Name}: {svcEx.Message}");
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
            PairingDiag.Log($"pair_fail: {ex.GetType().Name}: {ex.Message}");
            _status.ForeColor = Theme.Danger;
            _status.Text = UserMessages.FromException(ex);
        }
        finally
        {
            _connect.Enabled = true;
        }
    }
}
