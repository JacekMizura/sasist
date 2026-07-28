namespace Sasist.Agent.Tray;

/// <summary>
/// Single motion library — hover, fade, transition, loading.
/// No per-screen animation code.
/// </summary>
internal static class Motion
{
    public const int HoverMs = 120;
    public const int FadeMs = 180;
    public const int TransitionMs = 200;
    public const int LoadingPulseMs = 900;

    /// <summary>Soft opacity pulse on a control while loading (tag-based; stop with StopPulse).</summary>
    public static void StartPulse(Control target)
    {
        StopPulse(target);
        var timer = new System.Windows.Forms.Timer { Interval = 40 };
        var t0 = Environment.TickCount64;
        timer.Tick += (_, _) =>
        {
            if (target.IsDisposed) { timer.Stop(); timer.Dispose(); return; }
            var phase = ((Environment.TickCount64 - t0) % LoadingPulseMs) / (float)LoadingPulseMs;
            var a = 0.55f + 0.45f * (float)Math.Sin(phase * Math.PI * 2);
            target.ForeColor = Color.FromArgb(
                Math.Clamp((int)(a * 255), 80, 255),
                Theme.MutedText);
            target.Invalidate();
        };
        target.Tag = timer;
        timer.Start();
    }

    public static void StopPulse(Control target)
    {
        if (target.Tag is System.Windows.Forms.Timer t)
        {
            t.Stop();
            t.Dispose();
            target.Tag = null;
        }
        target.ForeColor = Theme.Text;
    }

    public static Color HoverBlend(Color baseColor, Color hoverColor, bool hover) =>
        hover ? hoverColor : baseColor;
}
