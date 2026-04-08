export default function MatchReport({ report }) {
  if (!report || report.length === 0) return null;

  const noMatch = report.filter((r) => r.totalOptions === 0);
  const withMatch = report.filter((r) => r.totalOptions > 0);

  return (
    <div className="mt-6">
      <h2 className="text-lg font-semibold text-gray-700 mb-1">
        Reporte de coincidencias
      </h2>
      <p className="text-sm text-gray-400 mb-4">
        {withMatch.length} canciones encontradas · {noMatch.length} sin
        coincidencia
      </p>

      {/* Sin coincidencia */}
      {noMatch.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-red-500 mb-2">
            Sin coincidencia ({noMatch.length})
          </h3>
          <div className="flex flex-col gap-2">
            {noMatch.map((r, i) => (
              <div
                key={i}
                className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600"
              >
                {r.title}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Con coincidencia */}
      <div className="flex flex-col gap-3">
        {withMatch.map((r, i) => (
          <div
            key={i}
            className="bg-white border border-gray-200 rounded-xl p-4"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-gray-800 text-sm">
                {r.title}
              </span>
              <span className="text-xs text-gray-400">
                {r.totalOptions} opción{r.totalOptions > 1 ? "es" : ""}
              </span>
            </div>

            <div className="flex flex-col gap-1">
              {r.options.map((opt, j) => (
                <div
                  key={j}
                  className={`flex items-center justify-between text-xs px-3 py-2 rounded-lg ${
                    opt.cancion === r.chosen
                      ? "bg-green-50 text-green-700 font-medium"
                      : "bg-gray-50 text-gray-500"
                  }`}
                >
                  <span>{opt.cancion}</span>
                  <span>{opt.impactos.toLocaleString()} impactos</span>
                  {opt.cancion === r.chosen && (
                    <span className="ml-2 text-green-600">✓ elegida</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
