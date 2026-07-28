using Sasist.Agent.Core.Config;
using Sasist.Agent.Tray.Mvp;

namespace Sasist.Agent.Tray;

internal sealed class LogsPage : UserControl, IPageView
{
    private readonly ListBox _list;
    private readonly SasistSearchBox _search;
    private readonly List<LogLine> _all = new();
    private readonly SasistEmptyState _empty;
    private string _filter = "ALL";
    private bool _autoScroll = true;

    private sealed record LogLine(string Text, string Level, Color Color);

    public LogsPage()
    {
        Dock = DockStyle.Fill;
        UiBuffering.Enable(this);
        var shell = new PageShell("Logi", "Podgląd zdarzeń Sasist Agent — kolory, filtry i wyszukiwanie");

        var bar = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            BackColor = Color.Transparent,
            Padding = new Padding(0, 0, 0, Theme.Space.Md),
        };

        _search = new SasistSearchBox();
        _search.MaximumSize = new Size(480, 0);
        _search.MinimumSize = new Size(240, 40);
        _search.Margin = new Padding(0, 0, 0, Theme.Space.Sm);
        _search.Input.TextChanged += (_, _) => ApplyFilter();
        bar.Controls.Add(_search);

        var chips = new FlowLayoutPanel
        {
            AutoSize = true,
            WrapContents = false,
            FlowDirection = FlowDirection.LeftToRight,
            BackColor = Color.Transparent,
            Margin = new Padding(0, 0, 0, Theme.Space.Sm),
            Padding = Padding.Empty,
        };
        foreach (var f in new[] { "ALL", "INFO", "WARN", "ERROR", "DEBUG" })
        {
            var level = f;
            var chip = new SasistButton
            {
                Text = level,
                Kind = SasistButtonKind.Ghost,
                MinimumSize = new Size(56, 36),
                Margin = new Padding(0, 0, Theme.Space.Sm, 0),
                Padding = new Padding(Theme.Space.Md, Theme.Space.Sm, Theme.Space.Md, Theme.Space.Sm),
            };
            chip.Click += (_, _) => { _filter = level; ApplyFilter(); };
            chips.Controls.Add(chip);
        }

        var actions = new FlowLayoutPanel
        {
            AutoSize = true,
            WrapContents = true,
            FlowDirection = FlowDirection.LeftToRight,
            BackColor = Color.Transparent,
            Margin = Padding.Empty,
            Padding = Padding.Empty,
        };
        void addAction(string text, SasistButtonKind kind, EventHandler handler)
        {
            var b = new SasistButton { Text = text, Kind = kind, Margin = new Padding(0, 0, Theme.Space.Sm, Theme.Space.Sm) };
            b.Click += handler;
            actions.Controls.Add(b);
        }
        addAction("Kopiuj", SasistButtonKind.Secondary, (_, _) =>
        {
            var t = string.Join(Environment.NewLine, _list.Items.Cast<object>().OfType<LogLine>().Select(x => x.Text));
            if (!string.IsNullOrEmpty(t)) Clipboard.SetText(t);
        });
        addAction("Wyczyść", SasistButtonKind.Ghost, (_, _) => ClearFiles());
        addAction("Eksport", SasistButtonKind.Primary, (_, _) => Export());
        addAction("Odśwież", SasistButtonKind.Secondary, (_, _) => RefreshLogs());

        bar.Controls.Add(chips);
        bar.Controls.Add(actions);
        bar.Resize += (_, _) =>
        {
            actions.MaximumSize = new Size(Math.Max(200, bar.ClientSize.Width), 0);
            actions.Width = Math.Max(200, bar.ClientSize.Width);
        };

        var card = new SasistCard { Dock = DockStyle.Fill, Padding = new Padding(Theme.Space.Sm), Margin = new Padding(0, Theme.Space.Sm, 0, 0) };
        _list = new ListBox
        {
            Dock = DockStyle.Fill,
            BorderStyle = BorderStyle.None,
            DrawMode = DrawMode.OwnerDrawVariable,
            Font = Theme.Mono,
            IntegralHeight = false,
            BackColor = Theme.Surface,
        };
        _list.MeasureItem += (_, e) =>
        {
            if (e.Index < 0 || e.Index >= _list.Items.Count) return;
            var line = (LogLine)_list.Items[e.Index]!;
            var size = TextRenderer.MeasureText(line.Text, Theme.Mono, new Size(_list.ClientSize.Width - Theme.Space.Sm, int.MaxValue),
                TextFormatFlags.WordBreak | TextFormatFlags.NoPrefix | TextFormatFlags.TextBoxControl);
            e.ItemHeight = Math.Max(22, size.Height + Theme.Space.Xs);
        };
        _list.DrawItem += OnDrawItem;
        _list.SelectedIndexChanged += (_, _) =>
        {
            if (_list.Items.Count == 0) return;
            _autoScroll = _list.SelectedIndex >= _list.Items.Count - 3;
        };
        card.Controls.Add(_list);

        _empty = new SasistEmptyState(
            "Brak logów",
            "Zdarzenia pojawią się po uruchomieniu usługi Sasist Agent.",
            AppIcons.Logs)
        { Dock = DockStyle.Fill, Visible = false };

        var host = new Panel { Dock = DockStyle.Fill };
        host.Controls.Add(card);
        host.Controls.Add(_empty);

        shell.Body.Controls.Add(host);
        shell.Body.Controls.Add(bar);
        Controls.Add(shell);
    }

    private void OnDrawItem(object? sender, DrawItemEventArgs e)
    {
        e.DrawBackground();
        if (e.Index < 0 || e.Index >= _list.Items.Count) return;
        var line = (LogLine)_list.Items[e.Index]!;
        TextRenderer.DrawText(e.Graphics, line.Text, Theme.Mono, e.Bounds, line.Color,
            TextFormatFlags.Left | TextFormatFlags.Top | TextFormatFlags.WordBreak | TextFormatFlags.NoPrefix | TextFormatFlags.TextBoxControl);
    }

    public void ApplyValues(UiState state) { }
    public void ForceSync(UiState state) => RefreshLogs();

    public void RefreshLogs()
    {
        _all.Clear();
        try
        {
            AgentPaths.EnsureDirectories();
            var files = Directory.Exists(AgentPaths.LogsDir)
                ? Directory.GetFiles(AgentPaths.LogsDir, "*.*")
                    .Where(f => f.EndsWith(".log", StringComparison.OrdinalIgnoreCase) || f.EndsWith(".txt", StringComparison.OrdinalIgnoreCase))
                    .OrderByDescending(File.GetLastWriteTimeUtc).Take(8).ToList()
                : [];
            if (files.Count == 0)
                _all.Add(new LogLine("Brak logów. Pojawią się po uruchomieniu usługi.", "INFO", Theme.MutedText));
            else
            {
                foreach (var file in files)
                {
                    _all.Add(new LogLine($"===== {Path.GetFileName(file)} =====", "INFO", Theme.FaintText));
                    try
                    {
                        using var fs = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
                        using var sr = new StreamReader(fs);
                        var text = sr.ReadToEnd();
                        if (text.Length > 250_000) text = text[^250_000..];
                        foreach (var raw in text.Replace("\r\n", "\n").Split('\n'))
                        {
                            if (string.IsNullOrWhiteSpace(raw)) continue;
                            var level = Detect(raw);
                            _all.Add(new LogLine(raw, level, ColorFor(level)));
                        }
                    }
                    catch (Exception ex)
                    {
                        _all.Add(new LogLine($"(nie można odczytać: {ex.Message})", "ERROR", Theme.Danger));
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _all.Add(new LogLine(UserMessages.FromException(ex), "ERROR", Theme.Danger));
        }
        ApplyFilter();
    }

    private void ApplyFilter()
    {
        var q = _search.Input.Text.Trim();
        _list.BeginUpdate();
        _list.Items.Clear();
        foreach (var line in _all)
        {
            if (_filter != "ALL" && line.Level != _filter && !line.Text.StartsWith("=====")) continue;
            if (!string.IsNullOrEmpty(q) && line.Text.IndexOf(q, StringComparison.OrdinalIgnoreCase) < 0) continue;
            _list.Items.Add(line);
        }
        _list.EndUpdate();
        var empty = _list.Items.Count == 0;
        _empty.Visible = empty;
        _list.Parent!.Visible = !empty;
        if (_autoScroll && _list.Items.Count > 0)
            _list.TopIndex = Math.Max(0, _list.Items.Count - 1);
    }

    private static string Detect(string line)
    {
        var u = line.ToUpperInvariant();
        if (u.Contains("ERROR") || u.Contains("EXCEPTION") || u.Contains("FAIL")) return "ERROR";
        if (u.Contains("WARN")) return "WARN";
        if (u.Contains("DEBUG") || u.Contains("TRACE")) return "DEBUG";
        return "INFO";
    }

    private static Color ColorFor(string level) => level switch
    {
        "ERROR" => Theme.Danger,
        "WARN" => Theme.Warning,
        "DEBUG" => Theme.FaintText,
        _ => Theme.Info,
    };

    private void ClearFiles()
    {
        if (SasistDialog.Confirm(this, "Wyczyścić pliki logów?", "Logi") != DialogResult.Yes) return;
        foreach (var f in Directory.GetFiles(AgentPaths.LogsDir))
            try { File.WriteAllText(f, ""); } catch { }
        RefreshLogs();
    }

    private void Export()
    {
        using var dlg = new SaveFileDialog { Filter = "Tekst (*.txt)|*.txt", FileName = $"sasist-agent-logi-{DateTime.Now:yyyyMMdd-HHmm}.txt" };
        if (dlg.ShowDialog(this) == DialogResult.OK)
            File.WriteAllText(dlg.FileName, string.Join(Environment.NewLine, _list.Items.Cast<LogLine>().Select(x => x.Text)));
    }
}
