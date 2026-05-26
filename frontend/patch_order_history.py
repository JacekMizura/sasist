from pathlib import Path

p = Path("src/pages/Orders/OrderDetailPage.tsx")
text = p.read_text(encoding="utf-8")
start = "              {replacementHistoryOpen && historyChangeCount > 0 ? ("
end = "              <motionless className=\"mt-6 min-w-0\">".replace("motionless", "motionless")
end = '              <div className="mt-6 min-w-0">'
i0 = text.find(start)
i1 = text.find(end, i0)
if i0 < 0 or i1 < 0:
    raise SystemExit(f"markers not found: {i0} {i1}")

new = """              {replacementHistoryOpen && historyChangeCount > 0 ? (
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/95 px-4 py-3 text-sm text-slate-900 shadow-sm">
                  <p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-600">
                    Oś zdarzeń (pogrupowane po pozycji logicznej)
                  </p>
                  <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto">
                    {logicalOrderGroups
                      .flatMap((g) => g.timeline)
                      .sort((a, b) => {
                        const ta = a.at ? new Date(a.at).getTime() : 0;
                        const tb = b.at ? new Date(b.at).getTime() : 0;
                        return tb - ta;
                      })
                      .map((ev) => (
                        <li key={ev.id} className="border-t border-slate-200/70 pt-2 text-slate-700 first:border-t-0 first:pt-0">
                          {ev.at ? (
                            <p className="text-[11px] font-medium text-slate-500">{formatDetailDate(ev.at)}</p>
                          ) : null}
                          <p className="font-semibold text-slate-900">{ev.label}</p>
                          {ev.detail ? <p className="text-xs text-slate-600">{ev.detail}</p> : null}
                        </li>
                      ))}
                  </ul>
                </div>
              ) : null}

"""

text = text[:i0] + new + text[i1:]
old = """  const replacementPairs = useMemo(
    () => (order ? buildOrderReplacementPairs(order.items, wmsByItemId) : []),
    [order, wmsByItemId],
  );

"""
text = text.replace(old, "")
text = text.replace(
    'import { buildOrderReplacementPairs } from "../../components/orders/buildOrderReplacementSummary";\n',
    "",
)
p.write_text(text, encoding="utf-8")
print("patched")
