using System.Collections.Concurrent;
using Sasist.Agent.Sdk.Remote;

namespace Sasist.Agent.Core.Devices;

public sealed class RemoteActionDispatcher : IRemoteActionDispatcher
{
    private readonly ConcurrentDictionary<string, IRemoteActionHandler> _handlers = new(StringComparer.OrdinalIgnoreCase);

    public void Register(IRemoteActionHandler handler) => _handlers[handler.Action] = handler;

    public async Task<RemoteActionResult> DispatchAsync(RemoteActionRequest request, CancellationToken cancellationToken)
    {
        if (!_handlers.TryGetValue(request.Action, out var handler))
        {
            return new RemoteActionResult(
                Accepted: false,
                Completed: false,
                Action: request.Action,
                ErrorCode: "UNSUPPORTED_ACTION",
                ErrorMessage: $"No handler for {request.Action}");
        }

        return await handler.HandleAsync(request, cancellationToken);
    }
}
