import { useState } from "react";
import { useNavigate } from "react-router-dom";
import useStore from "../store/useStore";
import { uploadToDrive } from "../utils/googleDrive";

export default function Step3() {
  const navigate = useNavigate();
  const { matchReport, finalBuffer, reset } = useStore();
  const [driveStatus, setDriveStatus] = useState("idle"); // idle | loading | done | error
  const [driveLink, setDriveLink] = useState(null);

  const handleUploadDrive = async () => {
    if (!finalBuffer) return;
    setDriveStatus("loading");
    try {
      const link = await uploadToDrive(finalBuffer, "Hot 100 Final");
      setDriveLink(link);
      setDriveStatus("done");
    } catch (err) {
      console.error(err);
      setDriveStatus("error");
    }
  };

  const noMatch = matchReport?.filter((r) => r.totalOptions === 0) ?? [];
  const withMatch = matchReport?.filter((r) => r.totalOptions > 0) ?? [];

  const handleReset = () => {
    reset();
    navigate("/step1");
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Subir a Google Drive */}
      {driveStatus === "done" ? (
        <a
          href={driveLink}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-4 px-6 rounded-2xl transition-all text-lg text-center"
        >
          Abrir en Google Sheets →
        </a>
      ) : (
        <button
          onClick={handleUploadDrive}
          disabled={driveStatus === "loading" || !finalBuffer}
          className={`w-full font-semibold py-4 px-6 rounded-2xl transition-all text-lg ${
            driveStatus === "loading" || !finalBuffer
              ? "bg-gray-700 text-gray-500 cursor-not-allowed"
              : driveStatus === "error"
                ? "bg-red-500 hover:bg-red-400 text-white"
                : "bg-white hover:bg-gray-100 text-gray-900"
          }`}
        >
          {driveStatus === "loading"
            ? "Subiendo a Drive..."
            : driveStatus === "error"
              ? "Error — reintentar"
              : "Subir a Google Drive"}
        </button>
      )}

      <div>
        <h2 className="text-2xl font-bold text-white mb-1">Reporte</h2>
        <p className="text-gray-400 text-sm">
          Canciones que necesitaron búsqueda parcial
        </p>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 text-center">
          <p className="text-3xl font-bold text-white">
            {matchReport?.length ?? 0}
          </p>
          <p className="text-gray-500 text-xs mt-1">Total procesadas</p>
        </div>
        <div className="bg-gray-900 border border-green-900 rounded-2xl p-4 text-center">
          <p className="text-3xl font-bold text-green-400">
            {withMatch.length}
          </p>
          <p className="text-gray-500 text-xs mt-1">Encontradas</p>
        </div>
        <div className="bg-gray-900 border border-red-900 rounded-2xl p-4 text-center">
          <p className="text-3xl font-bold text-red-400">{noMatch.length}</p>
          <p className="text-gray-500 text-xs mt-1">Sin coincidencia</p>
        </div>
      </div>

      {/* Sin coincidencia */}
      {noMatch.length > 0 && (
        <div className="bg-gray-900 border border-red-900 rounded-2xl p-6">
          <h3 className="text-red-400 font-semibold mb-4 text-sm">
            Sin coincidencia ({noMatch.length})
          </h3>
          <div className="flex flex-col gap-2">
            {noMatch.map((r, i) => (
              <div
                key={i}
                className="bg-gray-800 rounded-xl px-4 py-3 text-sm text-red-300"
              >
                {r.title}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Con coincidencia */}
      {withMatch.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <h3 className="text-white font-semibold mb-4 text-sm">
            Encontradas con búsqueda parcial ({withMatch.length})
          </h3>
          <div className="flex flex-col gap-3">
            {withMatch.map((r, i) => (
              <div key={i} className="bg-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-medium text-white text-sm">
                    {r.title}
                  </span>
                  <span className="text-xs text-gray-500">
                    {r.totalOptions} opción{r.totalOptions > 1 ? "es" : ""}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  {r.options
                    .sort((a, b) => b.impactos - a.impactos)
                    .map((opt, j) => (
                      <div
                        key={j}
                        className={`flex items-center justify-between text-xs px-3 py-2 rounded-lg ${
                          opt.cancion === r.chosen
                            ? "bg-green-500 bg-opacity-10 text-green-400"
                            : "bg-gray-700 text-gray-400"
                        }`}
                      >
                        <span>{opt.cancion}</span>
                        <div className="flex items-center gap-3">
                          <span>{opt.impactos.toLocaleString()} impactos</span>
                          {opt.cancion === r.chosen && (
                            <span className="text-green-500 font-bold">✓</span>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Botones */}
      <div className="flex flex-col gap-3">
        <button
          onClick={handleReset}
          className="w-full bg-green-500 hover:bg-green-400 text-gray-950 font-semibold py-4 px-6 rounded-2xl transition-all text-lg"
        >
          Nuevo reporte
        </button>

        <button
          onClick={() => navigate("/step2")}
          className="w-full bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-400 font-semibold py-3 px-6 rounded-2xl transition-all text-sm"
        >
          ← Volver al paso 2
        </button>
      </div>
    </div>
  );
}
