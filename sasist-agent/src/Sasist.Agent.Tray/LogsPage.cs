using Sasist.Agent.Core.Config;

namespace Sasist.Agent.Tray;

internal sealed class LogsPage : UserControl
{
    private readonly TextBox _box;

    public LogsPage()
    {
        Dock = DockStyle.Fill;
        BackColor = Color.FromArgb(245, 246, 248);

        var title = new Label
        {
            Text = "Logi",
            Dock = DockStyle.Top,
            Height = 40,
            Font = new Font("Segoe UI Semibold", 18f),
        };

        _box = new TextBox
        {
            Dock = DockStyle.Fill,
            Multiline = true,
            ReadOnly = true,
            ScrollBars = ScrollBars.Both,
            Font = new Font("Consolas", 9f),
            BackColor = Color.White,
            WordWrap = false,
        };

        var toolbar = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            Height = 44,
            Padding = new Padding(0, 4, 0, 4),
        };

        void AddBtn(string text, EventHandler click)
        {
            var b = new Button
            {
                Text = text,
                Width = 110,
                Height = 34,
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.White,
                Cursor = Cursors.Hand,
            };
            b.Click += click;
            toolbar.Controls.Add(b);
        }

        AddBtn("Odśwież", (_, _) => RefreshData());
        AddBtn("Kopiuj", (_, _) =>
        {
            var text = _box.Text;
            if (!string.IsNullOrEmpty(text))
                Clipboard.SetText(text);
        });
        AddBtn("Wyczyść", (_, _) => ClearLogs());
        AddBtn("Zapisz…", (_, _) => SaveLogs());

        Controls.Add(_box);
        Controls.Add(toolbar);
        Controls.Add(title);
    }

    public void RefreshData()
    {
        try
        {
            AgentPaths.EnsureDirectories();
            var files = Directory.Exists(AgentPaths.LogsDir)
                ? Directory.GetFiles(AgentPaths.LogsDir, "*.*")
                    .Where(f => f.EndsWith(".log", StringComparison.OrdinalIgnoreCase)
                                || f.EndsWith(".txt", StringComparison.OrdinalIgnoreCase))
                    .OrderByDescending(File.GetLastWriteTimeUtc)
                    .Take(8)
                    .ToList()
                : [];

            if (files.Count == 0)
            {
                _box.Text = "Brak logów. Pojawią się po uruchomieniu usługi Sasist Agent.";
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
                    if (text.Length > 200_000)
                        text = text[^200_000..];
                    chunks.Add(text.TrimEnd());
                }
                catch (Exception ex)
                {
                    chunks.Add($"(nie można odczytać: {ex.Message})");
                }
                chunks.Add("");
            }

            _box.Text = string.Join(Environment.NewLine, chunks);
            _box.SelectionStart = _box.Text.Length;
            _box.ScrollToCaret();
        }
        catch (Exception ex)
        {
            _box.Text = UserMessages.FromException(ex);
        }
    }

    private void ClearLogs()
    {
        var ok = MessageBox.Show(
            "Wyczyścić zawartość plików logów?",
            "Logi",
            MessageBoxButtons.YesNo,
            MessageBoxIcon.Question);
        if (ok != DialogResult.Yes)
            return;

        try
        {
            foreach (var file in Directory.GetFiles(AgentPaths.LogsDir))
            {
                try { File.WriteAllText(file, ""); } catch { /* locked by service — skip */ }
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
        if (dlg.ShowDialog(this) != DialogResult.OK)
            return;
        File.WriteAllText(dlg.FileName, _box.Text);
    }

    public override void Refresh()
    {
        base.Refresh();
        RefreshData();
    }
}
