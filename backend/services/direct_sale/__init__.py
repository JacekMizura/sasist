"""Direct sale domain package — import concrete submodules; no eager re-exports.

Heavy modules (complete_service, workers, document pipeline) must not load on
``import backend.services.direct_sale`` or on light submodule imports.
Public facade: ``backend.services.direct_sale_service``.
"""
