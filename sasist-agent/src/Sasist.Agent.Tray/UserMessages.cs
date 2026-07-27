using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Net.Sockets;
using System.Text.Json;
using System.Text.Json.Serialization;
using Sasist.Agent.Core.Config;

namespace Sasist.Agent.Tray;

internal static class UserMessages
{
    public const string NetworkUnavailable = "Brak połączenia z Internetem.";
    public const string CannotReachSasist = "Nie udało się połączyć z Sasist.";
    public const string InvalidPairingCode = "Kod połączenia jest nieprawidłowy.";
    public const string PairingExpired = "Kod połączenia wygasł. Wygeneruj nowy w panelu Sasist.";
    public const string CannotSaveConfig = "Nie można zapisać ustawień. Uruchom Sasist Agent jako administrator.";
    public const string EnterPairingCode = "Wklej kod połączenia z panelu Sasist.";
    public const string Connecting = "Łączenie z Sasist…";
    public const string Connected = "Połączono. Możesz już drukować z Sasist.";
    public const string ServiceStartHint =
        "Połączono. Jeśli drukowanie nie działa od razu, uruchom ponownie komputer.";
    public const string RestartFailed =
        "Nie udało się uruchomić ponownie usługi. Uruchom Sasist Agent jako administrator.";
    public const string ServiceRestarted = "Usługa Sasist Agent została uruchomiona ponownie.";
    public const string DiagnosticsFailed = "Nie udało się uruchomić diagnostyki. Więcej informacji znajduje się w logach.";
    public const string UnpairConfirm =
        "Odłączyć ten komputer od Sasist?\n\nAby drukować ponownie, będziesz potrzebować nowego kodu połączenia.";
    public const string UpToDate = "Masz zainstalowaną najnowszą wersję.";
    public const string UpdateAvailable = "Dostępna jest nowa wersja.";
    public const string PrintFailed = "Nie można wydrukować dokumentu.\nWięcej informacji znajduje się w logach.";
    public const string GenericFailure = "Coś poszło nie tak.\nWięcej informacji znajduje się w logach.";

    public static string FromException(Exception ex)
    {
        try
        {
            AgentPaths.EnsureDirectories();
            File.AppendAllText(
                Path.Combine(AgentPaths.LogsDir, "tray-errors.log"),
                $"[{DateTimeOffset.Now:O}] {ex}\n\n");
        }
        catch
        {
            // ignore log failures
        }

        while (ex is AggregateException { InnerException: { } inner })
            ex = inner;

        return ex switch
        {
            UnauthorizedAccessException => CannotSaveConfig,
            DirectoryNotFoundException => CannotSaveConfig,
            IOException when Contains(ex, "access", "denied", "unauthorized") => CannotSaveConfig,
            SocketException => NetworkUnavailable,
            HttpRequestException hre when hre.InnerException is SocketException => NetworkUnavailable,
            HttpRequestException => NetworkUnavailable,
            TaskCanceledException => CannotReachSasist,
            TimeoutException => CannotReachSasist,
            PairingException pe => pe.UserMessage,
            _ => GenericFailure,
        };
    }

    private static bool Contains(Exception ex, params string[] needles)
    {
        var msg = ex.Message ?? "";
        return needles.Any(n => msg.Contains(n, StringComparison.OrdinalIgnoreCase));
    }
}

internal sealed class PairingException : Exception
{
    public string UserMessage { get; }

    public PairingException(string userMessage)
        : base(userMessage)
    {
        UserMessage = userMessage;
    }
}

internal static class PairingClient
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public static async Task<PairingResult> PairAsync(AgentConfig config, string pairingCode, CancellationToken ct)
    {
        config.EnsureCloudUrl();
        using var http = new HttpClient
        {
            BaseAddress = new Uri(config.ServerUrl.TrimEnd('/') + "/api/printing/"),
            Timeout = TimeSpan.FromSeconds(30),
        };

        var body = new
        {
            machine_id = config.MachineId,
            name = string.IsNullOrWhiteSpace(config.ComputerName) ? config.MachineId : config.ComputerName,
            version = AgentConfig.AgentVersion,
            printers = Array.Empty<object>(),
        };

        using var req = new HttpRequestMessage(HttpMethod.Post, "agents/register");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", pairingCode);
        req.Content = JsonContent.Create(body, options: JsonOptions);

        HttpResponseMessage res;
        try
        {
            res = await http.SendAsync(req, ct);
        }
        catch (HttpRequestException)
        {
            throw new PairingException(UserMessages.NetworkUnavailable);
        }
        catch (TaskCanceledException)
        {
            throw new PairingException(UserMessages.CannotReachSasist);
        }

        var json = await res.Content.ReadAsStringAsync(ct);
        if (res.StatusCode is System.Net.HttpStatusCode.Unauthorized or System.Net.HttpStatusCode.Forbidden)
            throw new PairingException(UserMessages.InvalidPairingCode);
        if ((int)res.StatusCode == 429)
            throw new PairingException(UserMessages.PairingExpired);
        if (!res.IsSuccessStatusCode)
            throw new PairingException(UserMessages.CannotReachSasist);

        var payload = JsonSerializer.Deserialize<RegisterResponse>(json, JsonOptions);
        if (payload is null || string.IsNullOrWhiteSpace(payload.Token))
            throw new PairingException(UserMessages.CannotReachSasist);

        var org = !string.IsNullOrWhiteSpace(payload.CompanyName)
            ? payload.CompanyName!
            : payload.WarehouseName ?? "";

        return new PairingResult(payload.AgentId, payload.Token, payload.WarehouseId, org);
    }

    private sealed class RegisterResponse
    {
        public int AgentId { get; set; }
        public string Token { get; set; } = "";
        public int? WarehouseId { get; set; }
        public string? CompanyName { get; set; }
        public string? WarehouseName { get; set; }
    }
}

internal readonly record struct PairingResult(int AgentId, string Token, int? WarehouseId, string OrganizationName);
