# Generates ReceivingDamageModal.tsx with valid JSX.
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "frontend/src/components/wms/receiving/ReceivingDamageModal.tsx"
D = "div"

jsx = f"""
  return (
    <{D}
      className="fixed inset-0 z-[1750] flex flex-col bg-slate-900/70 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4"
      role="presentation"
      onClick={{onClose}}
    >
      <{D}
        role="dialog"
        aria-modal="true"
        aria-labelledby="receiving-damage-title"
        className="flex h-full w-full flex-col bg-white sm:h-auto sm:max-h-[min(92vh,640px)] sm:max-w-md sm:rounded-3xl sm:shadow-2xl"
        onClick={{(e) => e.stopPropagation()}}
      >
        <{D} className="flex items-start justify-between border-b border-slate-100 px-4 py-4 sm:px-5">
          <{D} className="flex items-start gap-3">
            <{D} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
              <AlertTriangle size={{22}} strokeWidth={{2.5}} />
            </{D}>
            <{D}>
              <h2 id="receiving-damage-title" className="text-lg font-black text-slate-900">
                Oznacz jako uszkodzony
              </h2>
              <p className="mt-0.5 line-clamp-2 text-sm font-medium text-slate-600">{{title}}</p>
            </{D}>
          </{D}>
          <button type="button" onClick={{onClose}} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="Zamknij">
            <X size={{20}} />
          </button>
        </{D}>
        <{D} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
          <{D}>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500">Ilość uszkodzona</label>
            <input type="number" min={{1}} max={{cap}} value={{qty}} onChange={{(e) => setQty(Math.min(cap, Math.max(1, parseInt(e.target.value, 10) || 1)))}} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-xl font-black tabular-nums text-slate-900 outline-none ring-indigo-500 focus:ring-2" />
            <p className="mt-1 text-[11px] text-slate-500">Maks. {{cap}} szt. (przyjęte na PZ)</p>
          </{D}>
          <{D}>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500">Typ uszkodzenia</label>
            <select value={{damageType}} onChange={{(e) => setDamageType(e.target.value as DamageType)}} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none ring-indigo-500 focus:ring-2">
              {{DAMAGE_TYPES.map((t) => (
                <option key={{t.id}} value={{t.id}}>{{t.label}}</option>
              ))}}
            </select>
          </{D}>
          <{D}>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500">Notatka</label>
            <textarea value={{note}} onChange={{(e) => setNote(e.target.value)}} rows={{3}} placeholder="Opcjonalny opis uszkodzenia…" className="w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none ring-indigo-500 focus:ring-2" />
          </{D}>
          <{D}>
            <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-500">Zdjęcie (opcjonalnie)</p>
            <button type="button" disabled={{uploading || busy}} onClick={{() => void onPickPhoto()}} className="inline-flex min-h-[48px] items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50">
              <Camera size={{18}} />
              {{uploading ? "Wgrywanie…" : "Dodaj zdjęcie"}}
            </button>
          </{D}>
        </{D}>
        <{D} className="border-t border-slate-100 p-4 sm:px-5">
          <button type="button" disabled={{busy || uploading}} onClick={{() => void submit()}} className="mb-2 w-full min-h-[52px] rounded-2xl bg-rose-600 py-3 text-sm font-black uppercase tracking-wide text-white shadow-lg hover:bg-rose-700 disabled:opacity-50">Zatwierdź wadę</button>
          <button type="button" disabled={{busy}} onClick={{onClose}} className="w-full min-h-[48px] rounded-2xl bg-slate-100 py-3 text-sm font-bold uppercase text-slate-600 hover:bg-slate-200">Anuluj</button>
        </{D}>
      </{D}>
    </{D}>
  );
"""

# Too complex with f-string escaping. Use simpler approach: read clean template from heredoc with only {D}
template = open(Path(__file__).parent / "_damage_modal_body.txt", encoding="utf-8").read() if False else None
