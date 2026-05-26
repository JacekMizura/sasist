/**
 * Operational PL employer cost estimates — mirrors {@link backend/services/employer_cost_calculator.py}.
 * Not payroll / not legal advice. Keep constants in sync with Python.
 */

export const OPERATIONAL_COST_DISCLAIMER_PL =
  "";

/** Tooltip przy kwotach brutto i koszcie pracodawcy w kalkulatorze operacyjnym. */
export const OPERATIONAL_KPI_INFO_TOOLTIP_PL =
  "Szacunki orientacyjne dla celów operacyjnych. Rzeczywiste wartości zależą od ulg, wieku pracownika, PIT, PPK i ustawień kadrowych.";

const DEFAULT_UOP_EMPLOYER_RATE = 0.192;
const PPK_EMPLOYER_RATE = 0.015;
const DEFAULT_ZLECENIE_EMPLOYER_RATE = 0.12;
const DEFAULT_WORKING_DAYS_MONTH = 21;

export type OperationalCostBreakdown = {
  contractType: string;
  grossMonthly: number;
  netMonthly: number | null;
  employerTotalMonthly: number;
  hourlyPln: number;
  /** Netto miesięczne ÷ godziny w normie — gdy brak netto, 0. */
  netHourlyPln: number;
  employerHourlyPln: number;
  hoursPerMonth: number;
  estimatedDailyEmployer: number;
  estimatedDailyNet: number;
  assumptions: Record<string, unknown>;
};

export type OperationalExplanationRow = {
  label: string;
  amountPln: number;
  /** Opcjonalny dopisek pod etykietą (mniejszą czcionką w UI). */
  hint?: string;
};

export type OperationalCostExplanation = {
  intro: string;
  rows: OperationalExplanationRow[];
  footnote?: string;
};

export function estimateGrossMonthlyFromNetPln(contractType: string, netPln: number): number {
  const ct = (contractType || "uop").trim().toLowerCase();
  const n = Number(netPln) || 0;
  if (n <= 0) return 0;
  if (ct === "b2b") return Math.round((n / 0.79) * 100) / 100;
  if (ct === "zlecenie") return Math.round((n / 0.78) * 100) / 100;
  let k = 1.32;
  if (n < 3500) k = 1.48;
  else if (n < 5500) k = 1.42;
  else if (n < 8500) k = 1.38;
  else if (n < 12000) k = 1.35;
  return Math.round(n * k * 100) / 100;
}

export function estimateNetMonthlyFromGrossPln(contractType: string, grossPln: number): number {
  const ct = (contractType || "uop").trim().toLowerCase();
  const g = Number(grossPln) || 0;
  if (g <= 0) return 0;
  if (ct === "b2b") return Math.round(g * 0.79 * 100) / 100;
  if (ct === "zlecenie") return Math.round(g * 0.78 * 100) / 100;
  let k = 0.77;
  if (g < 5200) k = 0.71;
  else if (g < 8000) k = 0.73;
  else if (g < 12000) k = 0.75;
  return Math.round(g * k * 100) / 100;
}

function resolveGrossNet(
  contractType: string,
  grossIn: number | null | undefined,
  netIn: number | null | undefined,
): { gross: number; net: number; flags: Record<string, string> } {
  const ct = (contractType || "uop").trim().toLowerCase();
  const gRaw = grossIn != null && Number.isFinite(grossIn) ? grossIn : 0;
  const nRaw = netIn != null && Number.isFinite(netIn) ? netIn : 0;

  if (gRaw > 0 && nRaw > 0) {
    return { gross: Math.round(gRaw * 100) / 100, net: Math.round(nRaw * 100) / 100, flags: { gross_source: "user_input", net_source: "user_input" } };
  }
  if (gRaw > 0) {
    return {
      gross: Math.round(gRaw * 100) / 100,
      net: estimateNetMonthlyFromGrossPln(ct, gRaw),
      flags: { gross_source: "user_input", net_source: "estimated_from_gross" },
    };
  }
  if (nRaw > 0) {
    return {
      gross: estimateGrossMonthlyFromNetPln(ct, nRaw),
      net: Math.round(nRaw * 100) / 100,
      flags: { gross_source: "estimated_from_net", net_source: "user_input" },
    };
  }
  return { gross: 0, net: 0, flags: { gross_source: "none", net_source: "none" } };
}

/**
 * Full operational breakdown. If `employerTotalOverride` is set (>0), employer total uses override.
 */
export function computeOperationalEmployerCosts(params: {
  contractType: string;
  grossMonthly: number | null | undefined;
  netMonthly: number | null | undefined;
  hoursPerMonth: number;
  ppkEnabled: boolean;
  employerTotalOverride?: number | null;
  employerSideRateOverride?: number | null;
}): OperationalCostBreakdown {
  const ct = (params.contractType || "uop").trim().toLowerCase();
  let hpm = Number(params.hoursPerMonth) || 168;
  if (hpm <= 0) hpm = 168;

  const { gross, net, flags } = resolveGrossNet(ct, params.grossMonthly, params.netMonthly);

  const assumptions: Record<string, unknown> = {
    contract_type: ct,
    hours_per_month: hpm,
    disclaimer_pl: OPERATIONAL_COST_DISCLAIMER_PL,
    ...flags,
  };

  const manual =
    params.employerTotalOverride != null && params.employerTotalOverride > 0 ? params.employerTotalOverride : null;

  let employerTotal = 0;
  if (manual != null) {
    employerTotal = manual;
    assumptions.source = "manual_employer_total";
  } else if (ct === "b2b") {
    employerTotal = gross > 0 ? gross : 0;
    assumptions.source = "b2b_invoice_as_cost";
  } else if (ct === "zlecenie") {
    const rate = params.employerSideRateOverride ?? DEFAULT_ZLECENIE_EMPLOYER_RATE;
    assumptions.employer_rate = rate;
    employerTotal = gross > 0 ? gross * (1 + rate) : 0;
  } else {
    const rate = params.employerSideRateOverride ?? DEFAULT_UOP_EMPLOYER_RATE;
    assumptions.employer_rate = rate;
    employerTotal = gross > 0 ? gross * (1 + rate) : 0;
    if (params.ppkEnabled && gross > 0) {
      employerTotal += gross * PPK_EMPLOYER_RATE;
      assumptions.ppk_employer_rate = PPK_EMPLOYER_RATE;
    }
  }

  employerTotal = Math.round(employerTotal * 100) / 100;
  const hourly = gross > 0 ? Math.round((gross / hpm) * 100) / 100 : 0;
  const employerHourly = employerTotal > 0 && hpm > 0 ? Math.round((employerTotal / hpm) * 100) / 100 : 0;
  const netOut = net > 0 ? net : null;
  const netHourly =
    netOut != null && netOut > 0 && hpm > 0 ? Math.round((netOut / hpm) * 100) / 100 : 0;
  const dailyEmp = employerTotal > 0 ? Math.round((employerTotal / DEFAULT_WORKING_DAYS_MONTH) * 100) / 100 : 0;
  const dailyNet = net > 0 ? Math.round((net / DEFAULT_WORKING_DAYS_MONTH) * 100) / 100 : 0;

  return {
    contractType: ct,
    grossMonthly: gross,
    netMonthly: netOut,
    employerTotalMonthly: employerTotal,
    hourlyPln: hourly,
    netHourlyPln: netHourly,
    employerHourlyPln: employerHourly,
    hoursPerMonth: hpm,
    estimatedDailyEmployer: dailyEmp,
    estimatedDailyNet: dailyNet,
    assumptions,
  };
}

/**
 * Krótki, operacyjny opis „skąd się bierze” brutto i koszt firmy — bez poziomu księgowego.
 * Wywołuj tylko gdy {@link OperationalCostBreakdown.grossMonthly} &gt; 0.
 */
export function buildOperationalCostExplanation(bd: OperationalCostBreakdown): OperationalCostExplanation | null {
  const gross = bd.grossMonthly;
  if (!gross || gross <= 0) return null;

  const ct = (bd.contractType || "uop").trim().toLowerCase();
  const flags = bd.assumptions as Record<string, unknown>;
  const grossSource = String(flags.gross_source ?? "");
  const netSource = String(flags.net_source ?? "");
  const source = String(flags.source ?? "");
  const net = bd.netMonthly;

  if (ct === "b2b") {
    return {
      intro:
        "Model B2B: przyjmujemy uproszczenie, że koszt obciążenia firmy odpowiada kwocie brutto na fakturze (bez symulacji składek ZUS po stronie zleceniobiorcy).",
      rows: [{ label: "Orientacyjny koszt (brutto z pola)", amountPln: Math.round(gross * 100) / 100 }],
      footnote: "Rzeczywisty cash-flow zależy od VAT, zaliczek i umowy — to tylko orientacja dla panelu WMS.",
    };
  }

  if (source === "manual_employer_total") {
    const rows: OperationalExplanationRow[] = [];
    if (net != null && net > 0) {
      rows.push({ label: "Netto na rękę (z pola)", amountPln: net });
      const gap = Math.round((gross - net) * 100) / 100;
      if (gap > 0) {
        rows.push({
          label: "Różnica brutto − netto (modelowo: składki pracownika i zaliczka na PIT)",
          amountPln: gap,
          hint: "Nie rozbijamy na konkretne składki — to przybliżenie operacyjne.",
        });
      }
    }
    if (ct === "uop") {
      const rate = typeof flags.employer_rate === "number" ? (flags.employer_rate as number) : DEFAULT_UOP_EMPLOYER_RATE;
      rows.push({
        label: "Szacunkowe składki i fundusze pracodawcy (poza PPK)",
        amountPln: Math.round(gross * rate * 100) / 100,
      });
      if (typeof flags.ppk_employer_rate === "number" && (flags.ppk_employer_rate as number) > 0) {
        rows.push({
          label: "PPK pracodawcy (1,5% od brutto)",
          amountPln: Math.round(gross * (flags.ppk_employer_rate as number) * 100) / 100,
        });
      }
    } else if (ct === "zlecenie") {
      const rate =
        typeof flags.employer_rate === "number" ? (flags.employer_rate as number) : DEFAULT_ZLECENIE_EMPLOYER_RATE;
      rows.push({
        label: "Szacunkowy narzut pracodawcy na zlecenie",
        amountPln: Math.round(gross * rate * 100) / 100,
        hint: "Uproszczony procent od kwoty brutto — bez pełnej symulacji kadr.",
      });
    }
    return {
      intro:
        "Koszt pracodawcy został wpisany ręcznie. Poniżej pokazujemy wyłącznie orientacyjny rozkład od brutto — suma składników może różnić się od wpisanej kwoty całkowitej.",
      rows,
      footnote: "Użyj ręcznej wartości, gdy znasz koszt z kadr lub księgowości; pola powyżej służą do wyjaśnienia, nie do wymuszenia sumy.",
    };
  }

  const rows: OperationalExplanationRow[] = [];

  if (ct === "zlecenie") {
    let intro =
      "Szacunek dla umowy zlecenie: brutto z netto liczymy uproszczonym mnożnikiem; narzut pracodawcy — procent od brutta (model operacyjny).";
    if (grossSource === "estimated_from_net" && net != null && net > 0) {
      intro =
        "Szacunek dla zlecenia: brutto wyliczamy z podanego netta uproszczonym modelem (bez indywidualnych ulg).";
    } else if (netSource === "estimated_from_gross" && net != null && net > 0) {
      intro = "Netto szacujemy z brutta uproszczonym modelem — wartość na rękę jest orientacyjna.";
    }
    if (net != null && net > 0) {
      rows.push({ label: "Netto na rękę", amountPln: net });
      const gap = Math.round((gross - net) * 100) / 100;
      if (gap > 0) {
        rows.push({
          label: "Różnica brutto − netto (modelowo: składki i zaliczka na PIT po stronie zleceniobiorcy)",
          amountPln: gap,
        });
      }
    }
    const rate = typeof flags.employer_rate === "number" ? (flags.employer_rate as number) : DEFAULT_ZLECENIE_EMPLOYER_RATE;
    rows.push({
      label: "Szacunkowy narzut pracodawcy (zlecenie)",
      amountPln: Math.round(gross * rate * 100) / 100,
    });
    return { intro, rows, footnote: "Koszt firmy w podsumowaniu = brutto zlecenia + narzut (zaokrąglenia w PLN)." };
  }

  // UoP (domyślny model)
  let intro =
    "Brutto i/lub netto pochodzą z pól formularza. Poniżej: orientacyjny podział kosztu firmy względem brutta (składki pracodawcy wg uproszczonej stawki modelowej).";
  if (grossSource === "estimated_from_net" && net != null && net > 0) {
    intro =
      "Szacunek dla standardowej UoP bez szczegółowych ulg podatkowych. Brutto z netta wyliczamy uproszczonym mnożnikiem modelowym — to nie zastępuje kadr ani listy płac.";
  } else if (netSource === "estimated_from_gross" && net != null && net > 0) {
    intro =
      "Netto szacujemy z brutta uproszczonym modelem (bez indywidualnych ulg i dodatków) — wartość na rękę jest orientacyjna.";
  }

  if (net != null && net > 0) {
    rows.push({
      label:
        netSource === "user_input"
          ? "Netto na rękę (z pola)"
          : "Szacowane netto na rękę",
      amountPln: net,
    });
    const gap = Math.round((gross - net) * 100) / 100;
    if (gap > 0) {
      rows.push({
        label:
          "Szacowana różnica brutto − netto (modelowo: składki pracownika i zaliczka na PIT — bez rozbicia na składniki)",
        amountPln: gap,
      });
    }
  }

  const rate = typeof flags.employer_rate === "number" ? (flags.employer_rate as number) : DEFAULT_UOP_EMPLOYER_RATE;
  rows.push({
    label: "Szacunkowe składki i fundusze pracodawcy (ZUS, FGŚP, FP itd., bez PPK)",
    amountPln: Math.round(gross * rate * 100) / 100,
  });
  if (typeof flags.ppk_employer_rate === "number" && (flags.ppk_employer_rate as number) > 0) {
    rows.push({
      label: "PPK pracodawcy (1,5% od brutto)",
      amountPln: Math.round(gross * (flags.ppk_employer_rate as number) * 100) / 100,
    });
  }

  return {
    intro,
    rows,
    footnote: "Łączny koszt pracodawcy w podsumowaniu = brutto wynagrodzenia + narzut wg modelu (+ PPK, jeśli zaznaczone).",
  };
}
