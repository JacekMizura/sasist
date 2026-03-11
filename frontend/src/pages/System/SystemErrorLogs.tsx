export default function SystemErrorLogs() {
  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-slate-800 mb-4">Logi błędów</h2>
      <p className="text-slate-600">
        Błędy backendu są rejestrowane przez middleware. Endpoint z listą błędów (ostatnie 24h)
        będzie dostępny w kolejnej wersji.
      </p>
    </div>
  );
}
