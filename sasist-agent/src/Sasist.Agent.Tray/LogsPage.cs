using Sasist.Agent.Core.Config;

namespace Sasist.Agent.Tray;

internal sealed class LogsPage : UserControl, IRefreshablePage
{
    private readonly RichTextBox _box;
    private readonly ModernTextBox _search;
    private string _filter = "ALL";
    private bool _autoScroll = true;
    private string _raw = "";

    public LogsPage()
    {
        Dock = DockStyle.Fill;
        BackColor = Color.Transparent;
        Controls.Add(new PageHeader("Logi", "Podgląd logów Sasist Agent"));

        var toolbar = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            Height = 52,
            Padding = new Padding(0, 4, 0, 8),
            BackColor = Color.Transparent,
            WrapContents = false,
        };

        _search = new ModernTextBox { Width = 220, Height = 36, PlaceholderText = "Szukaj…" };
        _search.Inner.TextChanged += (_, _) => Render();

        toolbar.Controls.Add(_search);
        foreach (var f in new[] { "ALL", "INFO", "WARN", "ERROR", "DEBUG" })
        {
            var level = f;
            var b = new ModernButton { Text = level, Width = 72, Height = 36, Margin = new Padding(6, 0, 0, 0) };
            b.Click += (_, _) => { _filter = level; Render(); };
            toolbar.Controls.Add(b);
        }

        var copy = new ModernButton { Text = "Kopiuj", Width = 90, Margin = new Padding(12, 0, 0, 0) };
        copy.Click += (_, _) =>
        {
            var text = _box.Text;
            if (!string.IsNullOrEmpty(text))
                Clipboard.SetText(text);
        };
        var clear = new ModernButton { Text = "Wyczyść", Width = 90 };
        clear.Click += (_, _) => ClearLogs();
        var save = new ModernButton { Text = "Eksport", Width = 90, Primary = true };
        save.Click += (_, _) => SaveLogs();
        var refresh = new ModernButton { Text = "Odśwież", Width = 90 };
        refresh.Click += (_, _) => RefreshData();
        toolbar.Controls.Add(copy);
        toolbar.Controls.Add(clear);
        toolbar.Controls.Add(save);
        toolbar.Controls.Add(refresh);

        var card = new RoundedCard { Dock = DockStyle.Fill, Padding = new Padding(12) };
        _box = new RichTextBox
        {
            Dock = DockStyle.Fill,
            BorderStyle = BorderStyle.None,
            ReadOnly = true,
            Font = Theme.FontMono,
            DetectUrls = false,
            WordWrap = false,
            BackColor = Theme.CardBg,
            ForeColor = Theme.TextPrimary,
        };
        _box.VScroll += (_, _) =>
        {
            // if user scrolls up, pause auto-scroll
            _autoScroll = _box.GetPositionFromCharIndex(_box.TextLength).Y < _box.Height + 40;
        };
        card.Controls.Add(_box);

        Controls.Add(card);
        Controls.Add(toolbar);
        Theme.Changed += () =>
        {
            _box.BackColor = Theme.CardBg;
            _box.ForeColor = Theme.TextPrimary;
            Render();
        };
    }

    public void RefreshData()
    {
        try
        {
            AgentPaths.EnsureDirectories();
            var files = Directory.Exists(AgentPaths.LogsDir)
                ? Directory.GetFiles(AgentPaths.LogsDir, "*.*")
                    .Where(f => f.EndsWith(".log", StringComparison.OrdinalIgnoreCase) || f.EndsWith(".txt", StringComparison.OrdinalIgnoreCase))
                    .OrderByDescending(File.GetLastWriteTimeUtc)
                    .Take(8)
                    .ToList()
                : [];

            if (files.Count == 0)
            {
                _raw = "Brak logów. Pojawią się po uruchomieniu usługi.";
                Render();
                return;
            }

            var chunks = new List<string>();
            foreach (var file in files)
            {
                chunks.Add($"===== {Path.GetFileName(file)} =====");
                try
                {
                    using var fs = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
                    using var sr = new StreamReader(fs);
                    var text = sr.ReadToEnd();
                    if (text.Length > 250_000) text = text[^250_000..];
                    chunks.Add(text.TrimEnd());
                }
                catch (Exception ex)
                {
                    chunks.Add($"(nie można odczytać: {ex.Message})");
                }
            }
            _raw = string.Join(Environment.NewLine, chunks);
            Render();
        }
        catch (Exception ex)
        {
            _raw = UserMessages.FromException(ex);
            Render();
        }
    }

    private void Render()
    {
        var q = _search.Text.Trim();
        var lines = _raw.Replace("\r\n", "\n").Split('\n');
        _box.SuspendLayout();
        _box.Clear();
        foreach (var line in lines)
        {
            var level = DetectLevel(line);
            if (_filter != "ALL" && level != _filter && !line.StartsWith("====="))
                continue;
            if (!string.IsNullOrEmpty(q) && line.IndexOf(q, StringComparison.OrdinalIgnoreCase) < 0)
                continue;

            var color = level switch
            {
                "ERROR" => Theme.Danger,
                "WARN" => Theme.Warning,
                "DEBUG" => Theme.TextMuted,
                "INFO" => Theme.Info,
                _ => Theme.TextPrimary,
            };
            _box.SelectionStart = _box.TextLength;
            _box.SelectionColor = color;
            _box.AppendText(line + "\n");
        }
        _box.ResumeLayout();
        if (_autoScroll)
        {
            _box.SelectionStart = _box.TextLength;
            _box.ScrollToCaret();
        }
    }

    private static string DetectLevel(string line)
    {
        var u = line.ToUpperInvariant();
        if (u.Contains("ERROR") || u.Contains("FAIL") || u.Contains("EXCEPTION")) return "ERROR";
        if (u.Contains("WARN")) return "WARN";
        if (u.Contains("DEBUG") || u.Contains("TRACE")) return "DEBUG";
        if (u.Contains("INFO") || u.Contains("[PASS]") || u.Contains("OK")) return "INFO";
        return "INFO";
    }

    private void ClearLogs()
    {
        if (MessageBox.Show("Wyczyścić pliki logów?", "Logi", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes)
            return;
        try
        {
            foreach (var file in Directory.GetFiles(AgentPaths.LogsDir))
            {
                try { File.WriteAllText(file, ""); } catch { /* locked */ }
            }
            RefreshData();
        }
        catch (Exception ex)
        {
            MessageBox.Show(UserMessages.FromException(ex), "Logi", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private void SaveLogs()
    {
        using var dlg = new SaveFileDialog
        {
            Filter = "Plik tekstowy (*.txt)|*.txt",
            FileName = $"sasist-agent-logi-{DateTime.Now:yyyyMMdd-HHmm}.txt",
        };
        if (dlg.ShowDialog(this) == DialogResult.OK)
            File.WriteAllText(dlg.FileName, _box.Text);
    }

    public override void Refresh()
    {
        base.Refresh();
        RefreshData();
    }
}
