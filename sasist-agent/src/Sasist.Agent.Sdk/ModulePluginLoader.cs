using System.Reflection;

namespace Sasist.Agent.Sdk;

/// <summary>Discovers <see cref="IAgentModule"/> implementations without Host hardcoding module types.</summary>
public static class ModulePluginLoader
{
    public static IReadOnlyList<IAgentModule> Discover(params Assembly[] assemblies)
    {
        var list = new List<IAgentModule>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var assembly in assemblies.Distinct())
        {
            Type[] types;
            try { types = assembly.GetTypes(); }
            catch (ReflectionTypeLoadException ex) { types = ex.Types.Where(t => t is not null).Cast<Type>().ToArray(); }

            foreach (var type in types)
            {
                if (type is null || type.IsAbstract || type.IsInterface)
                    continue;
                if (!typeof(IAgentModule).IsAssignableFrom(type))
                    continue;
                if (type.GetConstructor(Type.EmptyTypes) is null &&
                    !type.GetConstructors().Any(c => c.GetParameters().All(p => p.HasDefaultValue || p.IsOptional)))
                    continue;

                IAgentModule instance;
                try
                {
                    var ctor = type.GetConstructor(Type.EmptyTypes)
                               ?? type.GetConstructors().First(c => c.GetParameters().All(p => p.HasDefaultValue || p.IsOptional));
                    var args = ctor.GetParameters().Select(p => p.DefaultValue is DBNull ? null : p.DefaultValue).ToArray();
                    instance = (IAgentModule)ctor.Invoke(args)!;
                }
                catch { continue; }

                if (!seen.Add(instance.ModuleId))
                    continue;
                list.Add(instance);
            }
        }

        return list;
    }

    /// <summary>
    /// Loads module assemblies from a plugins directory (Sasist.Agent.Modules.*.dll)
    /// plus already-loaded assemblies matching the same name pattern.
    /// </summary>
    public static IReadOnlyList<IAgentModule> DiscoverFromPlugins(string? pluginsDirectory = null)
    {
        var assemblies = new List<Assembly>();
        var loadedPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        void TryLoad(string dllPath)
        {
            if (!loadedPaths.Add(dllPath))
                return;
            try { assemblies.Add(Assembly.LoadFrom(dllPath)); }
            catch { /* skip */ }
        }

        foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
        {
            var name = asm.GetName().Name ?? "";
            if (name.StartsWith("Sasist.Agent.Modules.", StringComparison.OrdinalIgnoreCase))
                assemblies.Add(asm);
        }

        var baseDir = AppContext.BaseDirectory;
        foreach (var dll in Directory.EnumerateFiles(baseDir, "Sasist.Agent.Modules.*.dll"))
            TryLoad(dll);

        var dirs = new List<string>();
        if (!string.IsNullOrWhiteSpace(pluginsDirectory))
            dirs.Add(pluginsDirectory);
        dirs.Add(Path.Combine(baseDir, "plugins"));

        foreach (var dir in dirs.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            if (!Directory.Exists(dir))
                continue;
            foreach (var dll in Directory.EnumerateFiles(dir, "Sasist.Agent.Modules.*.dll"))
                TryLoad(dll);
        }

        return Discover(assemblies.ToArray());
    }
}
