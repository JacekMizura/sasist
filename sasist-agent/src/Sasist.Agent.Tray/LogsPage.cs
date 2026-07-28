using Sasist.Agent.Core.Config;
using Sasist.Agent.Tray.Mvp;

namespace Sasist.Agent.Tray;

internal sealed class LogsPage : UserControl, IPageView
{
    private readonly ListBox _list;
    private readonly TextBox _search;
    private readonly List<LogLine> _all = new();
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
            WrapContents = true,
            BackColor = Color.Transparent,
            Padding = new Padding(0, 0, 0, 8),
        };

        var searchHost = new SasistCard
        {
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            Padding = new Padding(10, 8, 10, 8),
            Margin = new Padding(0, 0, 8, 8),
            MinimumSize = new Size(240, 36),
        };
        _search = new TextBox
        {
            BorderStyle = BorderStyle.None,
            Font = Theme.FontBody,
            PlaceholderText = "Szukaj…",
            BackColor = Theme.Surface,
            Dock = DockStyle.Top,
            MinimumSize = new Size(180, 22),
        };
        _search.TextChanged += (_, _) => ApplyFilter();
        searchHost.Controls.Add(_search);
        bar.Controls.Add(searchHost);

        foreach (var f in new[] { "ALL", "INFO", "WARN", "ERROR", "DEBUG" })
        {
            var level = f;
            var b = new SasistButton { Text = level, Margin = new Padding(0, 0, 6, 8) };
            b.Click += (_, _) => { _filter = level; ApplyFilter(); };
            bar.Controls.Add(b);
        }

        var copy = new SasistButton { Text = "Kopiuj", Margin = new Padding(8, 0, 0, 8) };
        copy.Click += (_, _) =>
        {
            var t = string.Join(Environment.NewLine, _list.Items.Cast<object>().OfType<LogLine>().Select(x => x.Text));
            if (!string.IsNullOrEmpty(t)) Clipboard.SetText(t);
        };
        var clear = new SasistButton { Text = "Wyczyść", Margin = new Padding(8, 0, 0, 8) };
        clear.Click += (_, _) => ClearFiles();
        var export = new SasistButton { Text = "Eksport", Primary = true, Margin = new Padding(8, 0, 0, 8) };
        export.Click += (_, _) => Export();
        var refresh = new SasistButton { Text = "Odśwież", Margin = new Padding(8, 0, 0, 8) };
        refresh.Click += (_, _) => RefreshLogs();
        bar.Controls.Add(copy);
        bar.Controls.Add(clear);
        bar.Controls.Add(export);
        bar.Controls.Add(refresh);

        var card = new SasistCard { Dock = DockStyle.Fill, Padding = new Padding(8), Margin = new Padding(0, 8, 0, 0) };
        _list = new ListBox
        {
            Dock = DockStyle.Fill,
            BorderStyle = BorderStyle.None,
            DrawMode = DrawMode.OwnerDrawVariable,
            Font = Theme.FontMono,
            IntegralHeight = false,
            BackColor = Theme.Surface,
        };
        _list.MeasureItem += (_, e) =>
        {
            if (e.Index < 0 || e.Index >= _list.Items.Count) return;
            var line = (LogLine)_list.Items[e.Index]!;
            var size = TextRenderer.MeasureText(line.Text, Theme.FontMono, new Size(_list.ClientSize.Width - 8, int.MaxValue),
                TextFormatFlags.WordBreak | TextFormatFlags.NoPrefix | TextFormatFlags.TextBoxControl);
            e.ItemHeight = Math.Max(22, size.Height + 4);
        };
        _list.DrawItem += OnDrawItem;
        _list.SelectedIndexChanged += (_, _) =>
        {
            if (_list.Items.Count == 0) return;
            _autoScroll = _list.SelectedIndex >= _list.Items.Count - 3;
        };
        card.Controls.Add(_list);

        shell.Body.Controls.Add(card);
        shell.Body.Controls.Add(bar);
        Controls.Add(shell);
    }

    private void OnDrawItem(object? sender, DrawItemEventArgs e)
    {
        e.DrawBackground();
        if (e.Index < 0 || e.Index >= _list.Items.Count) return;
        var line = (LogLine)_list.Items[e.Index]!;
        TextRenderer.DrawText(e.Graphics, line.Text, Theme.FontMono, e.Bounds, line.Color,
            TextFormatFlags.Left | TextFormatFlags.Top | TextFormatFlags.WordBreak | TextFormatFlags.NoPrefix | TextFormatFlags.TextBoxControl);
    }

    public void ApplyValues(UiState state) { /* logs are user-driven — never rebuild on poll */ }
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
                _all.Add(new LogLine("Brak logów. Pojawią się po uruchomieniu usługi.", "INFO", Theme.TextMuted));
            else
            {
                foreach (var file in files)
                {
                    _all.Add(new LogLine($"===== {Path.GetFileName(file)} =====", "INFO", Theme.TextFaint));
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
        var q = _search.Text.Trim();
        _list.BeginUpdate();
        _list.Items.Clear();
        foreach (var line in _all)
        {
            if (_filter != "ALL" && line.Level != _filter && !line.Text.StartsWith("=====")) continue;
            if (!string.IsNullOrEmpty(q) && line.Text.IndexOf(q, StringComparison.OrdinalIgnoreCase) < 0) continue;
            _list.Items.Add(line);
        }
        _list.EndUpdate();
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
        "DEBUG" => Theme.TextFaint,
        _ => Theme.Info,
    };

    private void ClearFiles()
    {
        if (MessageBox.Show("Wyczyścić pliki logów?", "Logi", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
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
