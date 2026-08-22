"""Message template variables package."""

from .registry import (
    GROUP_LABELS,
    TEMPLATE_VARIABLES,
    VARIABLE_BY_KEY,
    list_variable_catalog,
    list_variable_groups,
)
from .render import (
    RenderResult,
    RenderStringResult,
    log_render_gaps,
    render_template,
    render_template_string,
)

__all__ = [
    "GROUP_LABELS",
    "TEMPLATE_VARIABLES",
    "VARIABLE_BY_KEY",
    "list_variable_catalog",
    "list_variable_groups",
    "RenderResult",
    "RenderStringResult",
    "log_render_gaps",
    "render_template",
    "render_template_string",
]
