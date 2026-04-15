import { useState } from "react";
import { useNavigate } from "react-router-dom";
import DropZone from "../components/DropZone";
import useStore from "../store/useStore";
import {
  extractZeroRows,
  applyResolutions,
  sortByTotWithRadio,
  applyTableStyle,
  downloadResolved,
  readWorkbook,
} from "../utils/resolveZeros";

export default function Step2() {
  const navigate = useNavigate();
  const {
    colombiaData,
    setColombaData,
    calculatedFile,
    setCalculatedFile,
    setMatchReport,
    zeroRows,
    setZeroRows,
    currentIndex,
    setCurrentIndex,
    resolutions,
    resolveRow,
    nextRow,
    prevRow,
  } = useStore();

  const [phase, setPhase] = useState("upload"); // upload | review
  const [workbook, setWorkbook] = useState(null);
  const [calculatedData, setCalculatedData] = useState(null);
  const [manual, setManual] = useState(false);
  const [manualValues, setManualValues] = useState({
    impactos: "",
    sonadas: "",
    top: "",
  });
  const [loading, setLoading] = useState(false);

  const currentRow = zeroRows[currentIndex];
  const isDone = currentIndex >= zeroRows.length;

  const handleFileLoaded = async (file) => {
    setCalculatedFile(file);
  };

  const handleStartReview = async () => {
    try {
      setLoading(true);
      const {
        workbook: wb,
        data,
        colombiaData: colombiaFromFile,
      } = await readWorkbook(calculatedFile);
      const resolvedColombia = colombiaData ?? colombiaFromFile;
      setColombaData(resolvedColombia);
      const zeros = extractZeroRows(data, resolvedColombia);
      setWorkbook(wb);
      setCalculatedData(data);
      setZeroRows(zeros);
      setCurrentIndex(0);
      setPhase("review");
    } catch (err) {
      console.error(err);
      alert("Error al leer el archivo.");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = (values) => {
    const row = currentRow;
    const lumRow = calculatedData[row.rowNum - 2];
    const headers = Object.keys(lumRow);

    resolveRow(row.rowNum, {
      ...values,
      j: Number(lumRow[headers[9]] ?? 0),
      n: Number(lumRow[headers[13]] ?? 0),
      p: Number(lumRow[headers[15]] ?? 0),
    });

    setManual(false);
    setManualValues({ impactos: "", sonadas: "", top: "" });
    nextRow();
  };

  const handleFinish = (wb) => {
    let resolved = applyResolutions(wb ?? workbook, resolutions);
    resolved = sortByTotWithRadio(resolved);
    resolved = applyTableStyle(resolved);
    const report = zeroRows.slice(0, currentIndex).map((r) => ({
      title: r.title,
      chosen: resolutions[r.rowNum]
        ? `Manual: ${resolutions[r.rowNum].impactos} impactos`
        : (r.best?.cancion ?? "Sin coincidencia"),
      impactos: resolutions[r.rowNum]?.impactos ?? 0,
      totalOptions: r.options.length,
      options: r.options,
    }));
    setMatchReport(report);
    downloadResolved(resolved);
    navigate("/step3");
  };

  const handleAbort = () => {
    handleFinish(workbook);
  };

  // — FASE UPLOAD —
  if (phase === "upload") {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">Resolver zeros</h2>
          <p className="text-gray-400 text-sm">
            Sube el archivo Hot 100.xlsx después de abrirlo y guardarlo en Excel
          </p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <h3 className="text-white font-semibold mb-4">Instrucciones</h3>
          <div className="flex flex-col gap-3">
            {[
              "Abre el archivo Hot 100.xlsx en Excel",
              "Espera que Excel calcule todas las fórmulas",
              "Guarda el archivo con Ctrl+S",
              "Súbelo aquí abajo",
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-xs text-gray-400 font-bold flex-shrink-0">
                  {i + 1}
                </div>
                <p className="text-gray-300 text-sm">{step}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <h3 className="text-white font-semibold mb-4">Archivo calculado</h3>
          <DropZone
            onDataLoaded={() => {}}
            onFileLoaded={handleFileLoaded}
            inputId="calculated-input"
          />
          {calculatedFile && (
            <p className="text-sm text-green-400 mt-3">
              ✓ {calculatedFile.name} listo
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3">
          {calculatedFile && (
            <button
              onClick={handleStartReview}
              disabled={loading}
              className={`w-full font-semibold py-4 px-6 rounded-2xl transition-all text-lg ${
                loading
                  ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                  : "bg-green-500 hover:bg-green-400 text-gray-950"
              }`}
            >
              {loading ? "⏳ Cargando..." : "Iniciar revisión →"}
            </button>
          )}
          <button
            onClick={() => navigate("/step1")}
            className="w-full bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-400 font-semibold py-3 px-6 rounded-2xl transition-all text-sm"
          >
            ← Volver al paso 1
          </button>
        </div>
      </div>
    );
  }

  // — FASE REVIEW —
  return (
    <div className="flex flex-col gap-6">
      {/* Header revisión */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">Revisión</h2>
          <p className="text-gray-400 text-sm">
            Confirma o corrige cada canción
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-2 text-center">
            <p className="text-2xl font-bold text-white">
              {Math.min(currentIndex + 1, zeroRows.length)}
              <span className="text-gray-600 text-lg">
                {" "}
                / {zeroRows.length}
              </span>
            </p>
          </div>
          <button
            onClick={prevRow}
            disabled={currentIndex === 0}
            className={`font-semibold py-2 px-4 rounded-xl transition-all text-sm border ${
              currentIndex === 0
                ? "border-gray-800 text-gray-700 cursor-not-allowed"
                : "border-gray-700 bg-gray-900 hover:bg-gray-800 text-gray-400"
            }`}
          >
            ← Anterior
          </button>
          <button
            onClick={handleAbort}
            className="bg-red-500 bg-opacity-10 hover:bg-opacity-20 border border-red-900 text-red-400 font-semibold py-2 px-4 rounded-xl transition-all text-sm"
          >
            Abortar
          </button>
        </div>
      </div>

      {/* Barra de progreso */}
      <div className="w-full bg-gray-800 rounded-full h-1.5">
        <div
          className="bg-green-500 h-1.5 rounded-full transition-all"
          style={{ width: `${(currentIndex / zeroRows.length) * 100}%` }}
        />
      </div>

      {/* Tarjeta canción */}
      {!isDone ? (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">Buscando</p>
            <p className="text-xl font-bold text-white">{currentRow.title}</p>
            <p className="text-sm text-gray-400">{currentRow.artist}</p>
          </div>

          {!manual ? (
            <>
              {currentRow.options.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-gray-500">
                    Opciones encontradas — click para seleccionar
                  </p>
                  {currentRow.options.map((opt, i) => (
                    <button
                      key={i}
                      onClick={() =>
                        handleConfirm({
                          impactos: opt.impactos,
                          sonadas: opt.sonadas,
                          top: opt.top,
                        })
                      }
                      className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all text-left ${
                        opt.cancion === currentRow.best?.cancion &&
                        opt.artista === currentRow.best?.artista
                          ? "border-green-700 bg-green-500 bg-opacity-10 text-green-300"
                          : "border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-500"
                      }`}
                    >
                      <div>
                        <p className="text-sm font-medium">{opt.cancion}</p>
                        <p className="text-xs text-gray-500">{opt.artista}</p>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-400">
                        <span>{opt.impactos.toLocaleString()} imp</span>
                        <span>{opt.sonadas.toLocaleString()} son</span>
                        <span>Top {opt.top}</span>
                        <span className="text-gray-600">score {opt.score}</span>
                        {opt.cancion === currentRow.best?.cancion &&
                          opt.artista === currentRow.best?.artista && (
                            <span className="text-green-500 font-bold">★</span>
                          )}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">
                  No se encontraron coincidencias
                </p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() =>
                    handleConfirm({ impactos: 0, sonadas: 0, top: 0 })
                  }
                  className="flex-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-400 font-semibold py-3 rounded-xl transition-all text-sm"
                >
                  Dejar en 0
                </button>
                <button
                  onClick={() => setManual(true)}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-400 font-semibold py-3 rounded-xl transition-all text-sm"
                >
                  Ingresar manualmente
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-gray-500">
                Ingresa los valores manualmente
              </p>
              {[
                { key: "impactos", label: "Radio Impact Col (Impactos)" },
                { key: "sonadas", label: "Played Radio Col (Sonadas)" },
                { key: "top", label: "Top Radio Col (Top)" },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="text-xs text-gray-400 mb-1 block">
                    {label}
                  </label>
                  <input
                    type="number"
                    value={manualValues[key]}
                    onChange={(e) =>
                      setManualValues((v) => ({ ...v, [key]: e.target.value }))
                    }
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-green-500"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const inputs = document.querySelectorAll(
                          "input[type='number']",
                        );
                        const idx = Array.from(inputs).indexOf(e.target);
                        if (idx < inputs.length - 1) {
                          inputs[idx + 1].focus();
                        } else {
                          handleConfirm({
                            impactos: Number(manualValues.impactos ?? 0),
                            sonadas: Number(manualValues.sonadas ?? 0),
                            top: Number(manualValues.top ?? 0),
                          });
                        }
                      }
                    }}
                  />
                </div>
              ))}
              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => setManual(false)}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-400 font-semibold py-3 rounded-xl transition-all text-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={() =>
                    handleConfirm({
                      impactos: Number(manualValues.impactos ?? 0),
                      sonadas: Number(manualValues.sonadas ?? 0),
                      top: Number(manualValues.top ?? 0),
                    })
                  }
                  className="flex-1 bg-green-500 hover:bg-green-400 text-gray-950 font-semibold py-3 rounded-xl transition-all text-sm"
                >
                  Guardar →
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        // Terminó
        <div className="bg-gray-900 border border-green-800 rounded-2xl p-6 text-center flex flex-col gap-4">
          <p className="text-4xl">✓</p>
          <p className="text-white font-bold text-xl">Revisión completada</p>
          <p className="text-gray-400 text-sm">
            {zeroRows.length} canciones revisadas
          </p>
          <button
            onClick={() => handleFinish(workbook)}
            className="w-full bg-green-500 hover:bg-green-400 text-gray-950 font-semibold py-4 rounded-2xl transition-all text-lg"
          >
            ⬇ Descargar Hot 100 Final.xlsx
          </button>
        </div>
      )}
    </div>
  );
}
