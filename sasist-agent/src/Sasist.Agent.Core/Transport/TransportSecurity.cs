namespace Sasist.Agent.Core.Transport;

public sealed class ApiException : Exception
{
    public int? StatusCode { get; }
    public ApiException(string message, int? statusCode = null) : base(message) => StatusCode = statusCode;
}

/// <summary>Anti-replay helpers for agent → ERP HTTP (timestamp + nonce).</summary>
public static class AgentRequestSecurity
{
    public const string TimestampHeader = "X-Sasist-Timestamp";
    public const string NonceHeader = "X-Sasist-Nonce";

    public static void ApplyReplayHeaders(HttpRequestMessage req)
    {
        req.Headers.TryAddWithoutValidation(TimestampHeader, DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString());
        req.Headers.TryAddWithoutValidation(NonceHeader, Guid.NewGuid().ToString("N"));
    }
}

/// <summary>Update package signature verification — Host may replace with Authenticode/Ed25519.</summary>
public interface IUpdateSignatureVerifier
{
    bool IsConfigured { get; }
    UpdateVerifyResult Verify(string packagePath, string? signaturePath);
}

public sealed record UpdateVerifyResult(bool Ok, string Message);

/// <summary>RC baseline: requires companion .sig file when configured; otherwise reports Planned.</summary>
public sealed class FilePresenceUpdateSignatureVerifier : IUpdateSignatureVerifier
{
    public bool IsConfigured => true;

    public UpdateVerifyResult Verify(string packagePath, string? signaturePath)
    {
        if (!File.Exists(packagePath))
            return new UpdateVerifyResult(false, "Package missing");
        var sig = signaturePath ?? packagePath + ".sig";
        if (!File.Exists(sig))
            return new UpdateVerifyResult(false, "Signature file missing (.sig required for RC updates)");
        return new UpdateVerifyResult(true, "Signature file present (full crypto verify Planned)");
    }
}
