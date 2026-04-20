import { useState } from "react";
import { REQUIRED_FIELDS } from "../utils/detectColumns";

export default function ColumnMapper({ mapping, columns, onConfirm }) {
  const [localMapping, setLocalMapping] = useState(mapping);

  const allMapped = REQUIRED_FIELDS.every(
    (f) => f.optional || localMapping[f.key]?.detectedCol,
  );

  const handleChange = (fieldKey, col) => {
    setLocalMapping((prev) => ({
      ...prev,
      [fieldKey]: { detectedCol: col, score: 100, confirmed: true },
    }));
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-white font-semibold mb-1">
          Verificar columnas de Colombia Radio
        </p>
        <p className="text-gray-400 text-sm">
          Detectamos automáticamente las columnas. Verifica que sean correctas.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {REQUIRED_FIELDS.map((field) => {
          const detected = localMapping[field.key];
          const isExact = detected?.score === 100;
          const isMissing = !detected?.detectedCol;

          return (
            <div
              key={field.key}
              className={`flex items-center justify-between gap-4 px-4 py-3 rounded-xl border ${
                isMissing
                  ? "border-red-900 bg-red-500 bg-opacity-5"
                  : isExact
                    ? "border-gray-700 bg-gray-800"
                    : "border-yellow-800 bg-yellow-500 bg-opacity-5"
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                    isMissing
                      ? "bg-red-900 text-red-300"
                      : isExact
                        ? "bg-gray-700 text-green-400"
                        : "bg-yellow-900 text-yellow-300"
                  }`}
                >
                  {field.label}
                </span>
                <span className="text-gray-500 text-xs">
                  {isMissing
                    ? "No detectada"
                    : isExact
                      ? "✓ Detectada"
                      : "⚠ Revisar"}
                </span>
              </div>

              <select
                value={detected?.detectedCol ?? ""}
                onChange={(e) => handleChange(field.key, e.target.value)}
                className="bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-green-500"
              >
                <option value="">— Seleccionar —</option>
                {columns.map((col) => (
                  <option key={col} value={col}>
                    {col}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      <button
        onClick={() => onConfirm(localMapping)}
        disabled={!allMapped}
        className={`w-full font-semibold py-3 px-6 rounded-xl transition-all text-sm ${
          allMapped
            ? "bg-green-500 hover:bg-green-400 text-gray-950"
            : "bg-gray-700 text-gray-500 cursor-not-allowed"
        }`}
      >
        Confirmar columnas →
      </button>
    </div>
  );
}
