using System.Text;

namespace Sasist.Agent.Tray;

/// <summary>
/// Layout foundation helpers (engine layer — not visual styling).
/// Screens must still use Design System components for look.
/// </summary>
internal static class LayoutHelpers
{
    public static Label Icon(string glyph, Color color, float size = 18f)
    {
        var i = new SasistIcon();
        i.Set(glyph, color, size);
        return i;
    }

    public static Label Text(string text, Font font, Color color) => new()
    {
        Text = text,
        AutoSize = true,
        Font = font,
        ForeColor = color,
        BackColor = Color.Transparent,
        Margin = Padding.Empty,
        UseMnemonic = false,
    };

    public static Label Muted(string text) => new SasistCaption { Text = text };
    public static Label Title(string text) => new SasistHeading { Text = text };
    public static Label Metric(string text, Color? color = null) =>
        new SasistMetric { Text = text, ForeColor = color ?? Theme.Text };

    public static Label Wrap(string text, Font font, Color color, int maxWidth = 400) => new()
    {
        Text = text,
        AutoSize = true,
        Font = font,
        ForeColor = color,
        BackColor = Color.Transparent,
        MaximumSize = new Size(Math.Max(80, maxWidth), 0),
        Margin = Padding.Empty,
        UseMnemonic = false,
    };

    public static void SetMaxWidth(Control c, int maxWidth)
    {
        if (c is Label { AutoSize: true } lbl)
            lbl.MaximumSize = new Size(Math.Max(80, maxWidth), 0);
    }

    public static int MeasureTextWidth(string text, Font font)
    {
        var sz = TextRenderer.MeasureText(text, font, new Size(int.MaxValue, int.MaxValue),
            TextFormatFlags.NoPrefix | TextFormatFlags.SingleLine | TextFormatFlags.NoPadding);
        return sz.Width;
    }
}

/// <summary>Walks the control tree and reports clipped / overlapping layout defects.</summary>
internal static class LayoutAuditor
{
    public sealed record Issue(string Path, string Kind, string Detail);

    public static List<Issue> Audit(Control root)
    {
        var issues = new List<Issue>();
        Walk(root, root.Name ?? root.GetType().Name, issues);
        return issues;
    }

    private static void Walk(Control c, string path, List<Issue> issues)
    {
        if (!c.Visible) return;

        if (c is Label lbl && !string.IsNullOrEmpty(lbl.Text) && lbl.Width > 0 && lbl.Height > 0)
        {
            var flags = TextFormatFlags.NoPrefix | TextFormatFlags.TextBoxControl;
            if (lbl.AutoSize)
                flags |= TextFormatFlags.WordBreak;
            else
                flags |= TextFormatFlags.SingleLine;

            var needed = TextRenderer.MeasureText(lbl.Text, lbl.Font,
                lbl.AutoSize ? new Size(Math.Max(1, lbl.MaximumSize.Width > 0 ? lbl.MaximumSize.Width : lbl.Width), int.MaxValue) : lbl.Size,
                flags);

            if (lbl.AutoSize)
            {
                if (needed.Width > lbl.Width + 2 && (lbl.MaximumSize.Width == 0 || needed.Width > lbl.MaximumSize.Width + 2))
                    issues.Add(new Issue(path, "clip-width", $"need {needed.Width}px, have {lbl.Width}px: \"{Trim(lbl.Text)}\""));
                if (needed.Height > lbl.Height + 4 && lbl.MaximumSize.Height > 0)
                    issues.Add(new Issue(path, "clip-height", $"need {needed.Height}px, have {lbl.Height}px: \"{Trim(lbl.Text)}\""));
            }
            else if (!lbl.AutoEllipsis)
            {
                if (needed.Width > lbl.ClientSize.Width + 2)
                    issues.Add(new Issue(path, "clip-width", $"need {needed.Width}px, have {lbl.ClientSize.Width}px: \"{Trim(lbl.Text)}\""));
                if (needed.Height > lbl.ClientSize.Height + 4)
                    issues.Add(new Issue(path, "clip-height", $"need {needed.Height}px, have {lbl.ClientSize.Height}px: \"{Trim(lbl.Text)}\""));
            }
        }

        if (c.Parent is { } parent && c.Visible && parent is not Form)
        {
            var pr = parent.DisplayRectangle;
            if (c.Bottom > pr.Bottom + 2 && c.Height > 8 && parent.Height > 0)
                issues.Add(new Issue(path, "clip-parent", $"child bottom {c.Bottom} > parent {pr.Bottom} ({c.GetType().Name})"));
        }

        if (c.HasChildren && c.Controls.Count > 1 && c is not TableLayoutPanel)
        {
            var kids = c.Controls.Cast<Control>().Where(x => x.Visible).ToList();
            for (var i = 0; i < kids.Count; i++)
            for (var j = i + 1; j < kids.Count; j++)
            {
                var a = kids[i];
                var b = kids[j];
                if (a.Dock != DockStyle.None || b.Dock != DockStyle.None) continue;
                var inter = Rectangle.Intersect(a.Bounds, b.Bounds);
                if (inter.Width > 4 && inter.Height > 4)
                {
                    issues.Add(new Issue(path, "overlap",
                        $"{a.GetType().Name}∩{b.GetType().Name} {inter.Width}x{inter.Height}"));
                }
            }
        }

        foreach (Control child in c.Controls)
            Walk(child, path + "/" + (string.IsNullOrEmpty(child.Name) ? child.GetType().Name : child.Name), issues);
    }

    private static string Trim(string s) => s.Length <= 40 ? s : s[..37] + "…";

    public static string FormatReport(IReadOnlyList<Issue> issues)
    {
        if (issues.Count == 0) return "OK — no clip/overlap defects";
        var sb = new StringBuilder();
        sb.AppendLine($"FAIL — {issues.Count} issue(s):");
        foreach (var i in issues.Take(40))
            sb.AppendLine($"  [{i.Kind}] {i.Path}: {i.Detail}");
        if (issues.Count > 40) sb.AppendLine($"  … +{issues.Count - 40} more");
        return sb.ToString();
    }
}
