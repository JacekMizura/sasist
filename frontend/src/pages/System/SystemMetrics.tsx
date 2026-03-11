export default function SystemMetrics() {
  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-slate-800 mb-4">Metryki API</h2>
      <p className="text-slate-600">
        Metryki zapytań (czas wykonania, statusy) są logowane przez middleware backendu.
        Endpoint eksportujący metryki do UI będzie dostępny w kolejnej wersji.
      </p>
    </div>
  );
}
