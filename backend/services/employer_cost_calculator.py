"""
Approximate employer-side monthly cost from gross (PL) — for operational KPIs only.

Rates are configurable constants (not legal/tax advice). Override per profile via
``employer_side_rate_override`` when needed.

Net ↔ brutto conversions are **simplified operational estimates** (piecewise factors),
not payroll-grade calculations — must stay in sync with ``operationalEmployerCosts.ts``.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional


# Bundled employer ZUS + FP + FGŚP etc. on top of gross (order of magnitude for PL 2024–2026).
DEFAULT_UOP_EMPLOYER_RATE = 0.192
PPK_EMPLOYER_RATE = 0.015

# Contract of mandate — simplified flat burden on payout (varies by case).
DEFAULT_ZLECENIE_EMPLOYER_RATE = 0.12

DISCLAIMER_PL = (
    ""
)


def estimate_gross_monthly_from_net_pln(contract_type: str, net_pln: float) -> float:
    """Operational gross from net (PLN / month)."""
    ct = (contract_type or "uop").strip().lower()
    n = float(net_pln or 0.0)
    if n <= 0:
        return 0.0
    if ct == "b2b":
        return round(n / 0.79, 2)
    if ct == "zlecenie":
        return round(n / 0.78, 2)
    # uop (default)
    if n < 3500:
        k = 1.48
    elif n < 5500:
        k = 1.42
    elif n < 8500:
        k = 1.38
    elif n < 12000:
        k = 1.35
    else:
        k = 1.32
    return round(n * k, 2)


def estimate_net_monthly_from_gross_pln(contract_type: str, gross_pln: float) -> float:
    """Operational net from gross (PLN / month)."""
    ct = (contract_type or "uop").strip().lower()
    g = float(gross_pln or 0.0)
    if g <= 0:
        return 0.0
    if ct == "b2b":
        return round(g * 0.79, 2)
    if ct == "zlecenie":
        return round(g * 0.78, 2)
    if g < 5200:
        k = 0.71
    elif g < 8000:
        k = 0.73
    elif g < 12000:
        k = 0.75
    else:
        k = 0.77
    return round(g * k, 2)


def _resolve_gross_net_for_model(
    *,
    contract_type: str,
    gross_in: Optional[float],
    net_in: Optional[float],
) -> tuple[float, float, dict[str, Any]]:
    """
    Returns (gross_model, net_model, flags).
    Prefers explicit gross when both provided (employer ZUS is tied to gross).
    """
    ct = (contract_type or "uop").strip().lower()
    flags: dict[str, Any] = {}
    g_raw = float(gross_in or 0.0)
    n_raw = float(net_in or 0.0)

    if g_raw > 0 and n_raw > 0:
        flags["net_source"] = "user_input"
        flags["gross_source"] = "user_input"
        return round(g_raw, 2), round(n_raw, 2), flags

    if g_raw > 0:
        net_m = estimate_net_monthly_from_gross_pln(ct, g_raw)
        flags["net_source"] = "estimated_from_gross"
        flags["gross_source"] = "user_input"
        return round(g_raw, 2), net_m, flags

    if n_raw > 0:
        gross_m = estimate_gross_monthly_from_net_pln(ct, n_raw)
        flags["gross_source"] = "estimated_from_net"
        flags["net_source"] = "user_input"
        return gross_m, round(n_raw, 2), flags

    return 0.0, 0.0, {"gross_source": "none", "net_source": "none"}


@dataclass
class CostBreakdown:
    gross_monthly: float
    employer_total_monthly: float
    net_monthly: Optional[float]
    hours_per_month: float
    hourly_pln: float
    employer_hourly_pln: float
    contract_type: str
    assumptions: dict[str, Any]


def compute_operational_costs(
    *,
    contract_type: str,
    gross_monthly_pln: Optional[float],
    net_monthly_pln: Optional[float],
    default_hours_per_month: float = 168.0,
    ppk_enabled: bool = False,
    employer_side_rate_override: Optional[float] = None,
    employer_total_manual_pln: Optional[float] = None,
) -> CostBreakdown:
    ct = (contract_type or "uop").strip().lower()
    hpm = float(default_hours_per_month or 168.0)
    if hpm <= 0:
        hpm = 168.0

    gross, net_model, pair_flags = _resolve_gross_net_for_model(
        contract_type=ct,
        gross_in=gross_monthly_pln,
        net_in=net_monthly_pln,
    )
    assumptions: dict[str, Any] = {
        "contract_type": ct,
        "hours_per_month": hpm,
        "disclaimer_pl": DISCLAIMER_PL,
        **pair_flags,
    }

    if employer_total_manual_pln is not None and float(employer_total_manual_pln) > 0:
        emp_total = float(employer_total_manual_pln)
        assumptions["source"] = "manual_employer_total"
    elif ct == "b2b":
        # Treat gross as agreed monthly invoice (employer cost = same unless manual).
        emp_total = gross if gross > 0 else float(employer_total_manual_pln or 0.0)
        assumptions["source"] = "b2b_invoice_as_cost"
    elif ct == "zlecenie":
        rate = employer_side_rate_override if employer_side_rate_override is not None else DEFAULT_ZLECENIE_EMPLOYER_RATE
        assumptions["employer_rate"] = rate
        emp_total = gross * (1.0 + rate) if gross > 0 else 0.0
    else:
        rate = employer_side_rate_override if employer_side_rate_override is not None else DEFAULT_UOP_EMPLOYER_RATE
        assumptions["employer_rate"] = rate
        emp_total = gross * (1.0 + rate)
        if ppk_enabled:
            emp_total += gross * PPK_EMPLOYER_RATE
            assumptions["ppk_employer_rate"] = PPK_EMPLOYER_RATE

    hourly = (gross / hpm) if gross > 0 else 0.0
    emp_hourly = (emp_total / hpm) if emp_total > 0 and hpm > 0 else 0.0

    net_out: Optional[float] = round(net_model, 2) if net_model > 0 else None

    return CostBreakdown(
        gross_monthly=gross,
        employer_total_monthly=round(emp_total, 2),
        net_monthly=net_out,
        hours_per_month=hpm,
        hourly_pln=round(hourly, 2),
        employer_hourly_pln=round(emp_hourly, 2),
        contract_type=ct,
        assumptions=assumptions,
    )
