using Sasist.Agent.Core.Config;

namespace Sasist.Agent.Tray;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        AgentPaths.EnsureDirectories();

        using var mutex = new Mutex(true, @"Global\Sasist.Agent.Tray", out var created);
        if (!created)
        {
            MessageBox.Show(
                "Sasist Agent jest już uruchomiony.",
                "Sasist Agent",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        var store = new ConfigStore();
        var config = store.Load();
        config.EnsureCloudUrl();
        store.Save(config);

        if (config.NeedsSetup)
        {
            using var pairing = new PairingForm(store);
            if (pairing.ShowDialog() != DialogResult.OK)
                return;
        }

        Application.Run(new TrayApplicationContext(store));
    }
}
