namespace Sasist.Agent.Sdk;

/// <summary>Routes commands/jobs to modules by ModuleId or Capability — never by hardcoded names.</summary>
public sealed class ModuleRegistry
{
    private readonly Dictionary<string, IAgentModule> _byId = new(StringComparer.OrdinalIgnoreCase);

    public void Register(IAgentModule module) => _byId[module.ModuleId] = module;

    public IReadOnlyList<IAgentModule> All => _byId.Values.OrderBy(m => m.ModuleId).ToList();

    public IAgentModule? GetById(string moduleId) =>
        _byId.TryGetValue(moduleId, out var m) ? m : null;

    public IAgentModule? ResolveByCapability(string capability)
    {
        foreach (var module in _byId.Values)
        {
            if (module.Capabilities.Any(c => c.Equals(capability, StringComparison.OrdinalIgnoreCase)))
                return module;
        }
        return null;
    }

    public IAgentModule? ResolveForJob(PendingModuleJob job)
    {
        if (!string.IsNullOrWhiteSpace(job.TargetModuleId))
            return GetById(job.TargetModuleId!);

        if (!string.IsNullOrWhiteSpace(job.RequiredCapability))
            return ResolveByCapability(job.RequiredCapability!);

        if (job.Payload.TryGetValue("module_id", out var mid) && mid is not null)
            return GetById(mid.ToString()!);

        if (job.Payload.TryGetValue("required_capability", out var cap) && cap is not null)
            return ResolveByCapability(cap.ToString()!);

        return null;
    }

    public IReadOnlyList<ModuleDescriptor> Descriptors() =>
        All.Select(m => new ModuleDescriptor(m.ModuleId, m.ModuleVersion, m.Capabilities)).ToList();
}
