using Sasist.Agent.Core.Config;

namespace Sasist.Agent.Tray;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        AgentPaths.EnsureDirectories();
        UiPreferences.Load();
        Theme.LoadFromPreferences();

        using var mutex = new Mutex(true, @"Global\Sasist.Agent.Tray", out var created);
        if (!created)
        {
            MessageBox.Show(
                "Sasist Agent jest już otwarty.\n\nSpójrz na ikonę przy zegarze i kliknij ją dwukrotnie.",
                "Sasist Agent",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        var store = new ConfigStore();
        var config = store.Load();
        config.EnsureCloudUrl();
        try { store.Save(config); } catch { /* ACL */ }

        Application.Run(new MainForm(store));
    }
}
