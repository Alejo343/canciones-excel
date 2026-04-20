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
  getWorkbookBuffer,
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
    setFinalBuffer,
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

  // Panel de corrección manual (override sobre cualquier fila del top 100)
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideLumQuery, setOverrideLumQuery] = useState("");
  const [overrideLum, setOverrideLum] = useState(null); // { rowNum, title, artist, i }
  const [overrideColQuery, setOverrideColQuery] = useState("");
  const [overrideCol, setOverrideCol] = useState(null);
  const [overrideLog, setOverrideLog] = useState([]);

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
    setFinalBuffer(getWorkbookBuffer(resolved));
    downloadResolved(resolved);
    navigate("/step3");
  };

  const handleAbort = () => {
    handleFinish(workbook);
  };

  // — Override manual —
  const normStr = (s) =>
    String(s ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

  const top100 = (calculatedData ?? []).slice(0, 100);
  const lumHeaders = top100.length ? Object.keys(top100[0]) : [];
  const titleKey = lumHeaders.find((h) => h.toUpperCase() === "TITLE") ?? "TITLE";
  const artistKey = lumHeaders.find((h) => h.toUpperCase() === "ARTIST") ?? "ARTIST";

  const lumResults = overrideLumQuery.trim().length >= 1
    ? top100
        .map((row, i) => ({ row, i }))
        .filter(({ row }) => {
          const hay = normStr(row[titleKey]) + " " + normStr(row[artistKey]);
          return hay.includes(normStr(overrideLumQuery));
        })
        .slice(0, 15)
    : [];

  const colResults =
    overrideColQuery.trim().length >= 2 && colombiaData
      ? colombiaData
          .filter((r) => {
            const hay = normStr(r.CANCION) + " " + normStr(r.ARTISTA);
            return hay.includes(normStr(overrideColQuery));
          })
          .slice(0, 20)
      : [];

  const applyOverride = () => {
    if (!overrideLum || !overrideCol) return;
    const lumRow = calculatedData[overrideLum.i];
    const headers = Object.keys(lumRow);
    resolveRow(overrideLum.rowNum, {
      impactos: Number(overrideCol.IMPACTOS ?? 0),
      sonadas: Number(overrideCol.SONADAS ?? 0),
      top: Number(overrideCol.TOP ?? 0),
      j: Number(lumRow[headers[9]] ?? 0),
      n: Number(lumRow[headers[13]] ?? 0),
      p: Number(lumRow[headers[15]] ?? 0),
    });
    setOverrideLog((prev) => [
      ...prev.filter((e) => e.rowNum !== overrideLum.rowNum),
      {
        rowNum: overrideLum.rowNum,
        title: overrideLum.title,
        artist: overrideLum.artist,
        chosen: overrideCol,
      },
    ]);
    setOverrideLumQuery("");
    setOverrideLum(null);
    setOverrideColQuery("");
    setOverrideCol(null);
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

      {/* Panel de corrección manual (override del top 100) */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl">
        <button
          onClick={() => setOverrideOpen((v) => !v)}
          className="w-full flex items-center justify-between px-6 py-4 text-left"
        >
          <div>
            <p className="text-white font-semibold text-sm">
              Corregir manualmente otra canción del top 100
            </p>
            <p className="text-gray-500 text-xs">
              Cuando la fórmula eligió mal y quieres reemplazarla con otra del
              catálogo de Colombia Radio
            </p>
          </div>
          <span className="text-gray-400 text-xl">{overrideOpen ? "−" : "+"}</span>
        </button>

        {overrideOpen && (
          <div className="border-t border-gray-800 p-6 flex flex-col gap-5">
            {/* Paso 1: buscar canción en Luminate (top 100) */}
            <div>
              <p className="text-xs text-gray-400 mb-2">
                1. Canción en Luminate (top 100)
              </p>
              {overrideLum ? (
                <div className="flex items-center justify-between bg-gray-800 border border-green-700 rounded-xl px-4 py-3">
                  <div>
                    <p className="text-sm text-green-300 font-medium">
                      {overrideLum.title}
                    </p>
                    <p className="text-xs text-gray-400">{overrideLum.artist}</p>
                    <p className="text-[10px] text-gray-600">
                      fila #{overrideLum.rowNum - 1}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setOverrideLum(null);
                      setOverrideLumQuery("");
                    }}
                    className="text-xs text-gray-400 hover:text-white"
                  >
                    Cambiar
                  </button>
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    value={overrideLumQuery}
                    onChange={(e) => setOverrideLumQuery(e.target.value)}
                    placeholder="Buscar por título o artista…"
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-green-500"
                  />
                  {lumResults.length > 0 && (
                    <div className="mt-2 flex flex-col gap-1 max-h-64 overflow-y-auto">
                      {lumResults.map(({ row, i }) => (
                        <button
                          key={i}
                          onClick={() =>
                            setOverrideLum({
                              rowNum: i + 2,
                              i,
                              title: row[titleKey],
                              artist: row[artistKey],
                            })
                          }
                          className="flex items-center justify-between px-3 py-2 rounded-lg border border-gray-800 bg-gray-850 hover:border-gray-600 text-left"
                        >
                          <div>
                            <p className="text-xs text-gray-200">
                              {row[titleKey]}
                            </p>
                            <p className="text-[10px] text-gray-500">
                              {row[artistKey]}
                            </p>
                          </div>
                          <span className="text-[10px] text-gray-600">
                            #{i + 1}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Paso 2: buscar en Colombia Radio */}
            {overrideLum && (
              <div>
                <p className="text-xs text-gray-400 mb-2">
                  2. Reemplazar con esta canción del catálogo Colombia Radio
                </p>
                {overrideCol ? (
                  <div className="flex items-center justify-between bg-gray-800 border border-orange-700 rounded-xl px-4 py-3">
                    <div>
                      <p className="text-sm text-orange-300 font-medium">
                        {overrideCol.CANCION}
                      </p>
                      <p className="text-xs text-gray-400">{overrideCol.ARTISTA}</p>
                      <p className="text-[10px] text-gray-500">
                        {Number(overrideCol.IMPACTOS ?? 0).toLocaleString()} imp ·{" "}
                        {Number(overrideCol.SONADAS ?? 0).toLocaleString()} son ·
                        Top {overrideCol.TOP}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setOverrideCol(null);
                        setOverrideColQuery("");
                      }}
                      className="text-xs text-gray-400 hover:text-white"
                    >
                      Cambiar
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      value={overrideColQuery}
                      onChange={(e) => setOverrideColQuery(e.target.value)}
                      placeholder="Buscar en Colombia Radio (mín. 2 caracteres)…"
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500"
                    />
                    {colResults.length > 0 && (
                      <div className="mt-2 flex flex-col gap-1 max-h-72 overflow-y-auto">
                        {colResults.map((r, i) => (
                          <button
                            key={i}
                            onClick={() => setOverrideCol(r)}
                            className="flex items-center justify-between px-3 py-2 rounded-lg border border-gray-800 bg-gray-850 hover:border-gray-600 text-left"
                          >
                            <div>
                              <p className="text-xs text-gray-200">{r.CANCION}</p>
                              <p className="text-[10px] text-gray-500">
                                {r.ARTISTA}
                              </p>
                            </div>
                            <div className="flex items-center gap-3 text-[10px] text-gray-500">
                              <span>
                                {Number(r.IMPACTOS ?? 0).toLocaleString()} imp
                              </span>
                              <span>
                                {Number(r.SONADAS ?? 0).toLocaleString()} son
                              </span>
                              <span>Top {r.TOP}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {overrideColQuery.trim().length >= 2 && colResults.length === 0 && (
                      <p className="text-xs text-gray-500 mt-2">Sin resultados</p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Aplicar */}
            {overrideLum && overrideCol && (
              <button
                onClick={applyOverride}
                className="w-full bg-green-500 hover:bg-green-400 text-gray-950 font-semibold py-3 rounded-xl transition-all text-sm"
              >
                Aplicar corrección
              </button>
            )}

            {/* Log de overrides aplicados */}
            {overrideLog.length > 0 && (
              <div className="border-t border-gray-800 pt-4">
                <p className="text-xs text-gray-500 mb-2">
                  Correcciones aplicadas ({overrideLog.length})
                </p>
                <div className="flex flex-col gap-1">
                  {overrideLog.map((e, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-[11px] px-3 py-2 bg-gray-850 border border-gray-800 rounded-lg"
                    >
                      <span className="text-gray-400">
                        <span className="text-gray-200">{e.title}</span>
                        <span className="text-gray-600"> → </span>
                        <span className="text-orange-300">
                          {e.chosen.CANCION}
                        </span>
                      </span>
                      <span className="text-gray-600">
                        {Number(e.chosen.IMPACTOS ?? 0).toLocaleString()} imp
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
