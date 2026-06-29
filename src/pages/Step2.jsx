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
import { fetchSongMap, saveSongMap } from "../utils/api";

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

  const [phase, setPhase] = useState("upload");
  const [workbook, setWorkbook] = useState(null);
  const [calculatedData, setCalculatedData] = useState(null);
  const [manual, setManual] = useState(false);
  const [manualValues, setManualValues] = useState({ impactos: "", sonadas: "", top: "" });
  const [loading, setLoading] = useState(false);

  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideLumQuery, setOverrideLumQuery] = useState("");
  const [overrideLum, setOverrideLum] = useState(null);
  const [overrideColQuery, setOverrideColQuery] = useState("");
  const [overrideCol, setOverrideCol] = useState(null);
  const [overrideLog, setOverrideLog] = useState([]);

  const currentRow = zeroRows[currentIndex];
  const isDone = currentIndex >= zeroRows.length;

  const handleFileLoaded = async (file) => setCalculatedFile(file);

  const handleStartReview = async () => {
    try {
      setLoading(true);
      const [{ workbook: wb, data, colombiaData: colombiaFromFile }, songMap] =
        await Promise.all([readWorkbook(calculatedFile), fetchSongMap().catch(() => [])]);
      const resolvedColombia = colombiaData ?? colombiaFromFile;
      setColombaData(resolvedColombia);
      const zeros = extractZeroRows(data, resolvedColombia, songMap);
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
    if (values.codigo || values.isrc) {
      saveSongMap(row.title, row.artist, values.isrc, values.codigo).catch(
        (e) => console.warn("No se pudo guardar song map:", e)
      );
    }
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

  const handleAbort = () => handleFinish(workbook);

  const normStr = (s) =>
    String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  const top100 = (calculatedData ?? []).slice(0, 100);
  const lumHeaders = top100.length ? Object.keys(top100[0]) : [];
  const titleKey = lumHeaders.find((h) => h.toUpperCase() === "TITLE") ?? "TITLE";
  const artistKey = lumHeaders.find((h) => h.toUpperCase() === "ARTIST") ?? "ARTIST";

  const lumResults =
    overrideLumQuery.trim().length >= 1
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

  const getColVal = (row, name) => {
    const key = Object.keys(row).find((k) => k.toUpperCase() === name.toUpperCase());
    return key ? (row[key] ?? "") : "";
  };

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
    const cod = getColVal(overrideCol, "CODIGO");
    const isr = getColVal(overrideCol, "ISRC");
    if (cod || isr) {
      saveSongMap(overrideLum.title, overrideLum.artist, isr, cod).catch(
        (e) => console.warn("No se pudo guardar song map:", e)
      );
    }
    setOverrideLog((prev) => [
      ...prev.filter((e) => e.rowNum !== overrideLum.rowNum),
      { rowNum: overrideLum.rowNum, title: overrideLum.title, artist: overrideLum.artist, chosen: overrideCol },
    ]);
    setOverrideLumQuery("");
    setOverrideLum(null);
    setOverrideColQuery("");
    setOverrideCol(null);
  };

  // ── FASE UPLOAD ──────────────────────────────────────────────────────────────
  if (phase === "upload") {
    return (
      <div className="grid grid-cols-[1fr_280px] gap-6 items-start">
        {/* Izquierda */}
        <div className="flex flex-col gap-5 min-w-0">
          <div>
            <h2 className="text-2xl font-bold text-white mb-1">Resolver zeros</h2>
            <p className="text-gray-400 text-sm">
              Sube el archivo Hot 100.xlsx después de abrirlo y guardarlo en Excel
            </p>
          </div>

          {/* Instrucciones */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-4">
              Antes de subir
            </p>
            <div className="flex flex-col gap-3">
              {[
                "Abre el archivo Hot 100.xlsx en Excel",
                "Espera que Excel calcule todas las fórmulas",
                "Guarda el archivo con Ctrl+S",
                "Súbelo abajo",
              ].map((text, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-xs text-gray-400 font-bold flex-shrink-0">
                    {i + 1}
                  </div>
                  <p className="text-gray-300 text-sm">{text}</p>
                </div>
              ))}
            </div>
          </div>

          {/* DropZone */}
          <div className={`bg-gray-900 border rounded-2xl p-5 transition-colors ${calculatedFile ? "border-green-800" : "border-gray-800"}`}>
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-white font-semibold text-sm">Archivo calculado</h3>
              {calculatedFile && (
                <span className="ml-auto text-xs text-green-400 font-medium">
                  ✓ {calculatedFile.name}
                </span>
              )}
            </div>
            <DropZone onDataLoaded={() => {}} onFileLoaded={handleFileLoaded} inputId="calculated-input" />
          </div>
        </div>

        {/* Derecha sticky */}
        <div className="flex flex-col gap-3 sticky top-6">
          {/* Estado */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-col gap-2">
            <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-1">Estado</p>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${calculatedFile ? "bg-green-400" : "bg-gray-700"}`} />
              <span className={`text-sm ${calculatedFile ? "text-green-400" : "text-gray-500"}`}>
                {calculatedFile ? `${calculatedFile.name}` : "Archivo — pendiente"}
              </span>
            </div>
          </div>

          <button
            onClick={handleStartReview}
            disabled={!calculatedFile || loading}
            className={`w-full font-semibold py-4 px-6 rounded-2xl transition-all text-lg ${
              calculatedFile && !loading
                ? "bg-green-500 hover:bg-green-400 text-gray-950"
                : "bg-gray-700 text-gray-500 cursor-not-allowed"
            }`}
          >
            {loading ? "⏳ Cargando..." : "Iniciar revisión →"}
          </button>

          <div className="border-t border-gray-800 pt-3">
            <button
              onClick={() => navigate("/step1")}
              className="w-full bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-400 font-semibold py-3 px-6 rounded-2xl transition-all text-sm"
            >
              ← Volver al paso 1
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── FASE REVIEW ──────────────────────────────────────────────────────────────
  const pct = zeroRows.length > 0 ? (currentIndex / zeroRows.length) * 100 : 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Barra de progreso — ancho completo */}
      <div className="flex items-center gap-4">
        <div className="flex-1 bg-gray-800 rounded-full h-1.5">
          <div
            className="bg-green-500 h-1.5 rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs text-gray-500 flex-shrink-0">
          {Math.min(currentIndex + 1, zeroRows.length)} / {zeroRows.length}
        </span>
      </div>

      {/* Grid principal */}
      <div className="grid grid-cols-[1fr_260px] gap-6 items-start">
        {/* Izquierda: canción actual */}
        <div className="min-w-0">
          {!isDone ? (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col gap-5">
              {/* Info canción */}
              <div className="border-b border-gray-800 pb-4">
                <p className="text-xs text-gray-500 mb-1">
                  {currentRow.pinned ? "✓ Match directo por CODIGO" : "Buscando coincidencia"}
                </p>
                <p className="text-2xl font-bold text-white leading-tight">{currentRow.title}</p>
                <p className="text-sm text-gray-400 mt-1">{currentRow.artist}</p>
              </div>

              {!manual ? (
                <>
                  {currentRow.options.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      <p className="text-xs text-gray-500 mb-1">
                        Opciones encontradas — haz clic para seleccionar
                      </p>
                      {currentRow.options.map((opt, i) => {
                        const isBest =
                          opt.cancion === currentRow.best?.cancion &&
                          opt.artista === currentRow.best?.artista;
                        return (
                          <button
                            key={i}
                            onClick={() =>
                              handleConfirm({
                                impactos: opt.impactos,
                                sonadas: opt.sonadas,
                                top: opt.top,
                                codigo: opt.codigo,
                                isrc: opt.isrc,
                              })
                            }
                            className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all text-left ${
                              isBest
                                ? "border-green-700 bg-green-500 bg-opacity-10 text-green-300"
                                : "border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-500"
                            }`}
                          >
                            <div>
                              <p className="text-sm font-medium">{opt.cancion}</p>
                              <p className="text-xs text-gray-500">{opt.artista}</p>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-gray-400 flex-shrink-0 ml-4">
                              <span>{opt.impactos.toLocaleString()} imp</span>
                              <span>{opt.sonadas.toLocaleString()} son</span>
                              <span>Top {opt.top}</span>
                              <span className="text-gray-600">score {opt.score}</span>
                              {isBest && <span className="text-green-500 font-bold">★</span>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No se encontraron coincidencias</p>
                  )}

                  <div className="flex gap-3 pt-1">
                    <button
                      onClick={() => handleConfirm({ impactos: 0, sonadas: 0, top: 0 })}
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
                  <p className="text-xs text-gray-500">Ingresa los valores manualmente</p>
                  {[
                    { key: "impactos", label: "Radio Impact Col (Impactos)" },
                    { key: "sonadas", label: "Played Radio Col (Sonadas)" },
                    { key: "top", label: "Top Radio Col (Top)" },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <label className="text-xs text-gray-400 mb-1 block">{label}</label>
                      <input
                        type="number"
                        value={manualValues[key]}
                        onChange={(e) => setManualValues((v) => ({ ...v, [key]: e.target.value }))}
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-green-500"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const inputs = document.querySelectorAll("input[type='number']");
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
                  <div className="flex gap-3 mt-1">
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
            /* Revisión completa */
            <div className="bg-gray-900 border border-green-800 rounded-2xl p-8 text-center flex flex-col gap-4">
              <div className="w-16 h-16 rounded-full bg-green-500 bg-opacity-20 border border-green-700 flex items-center justify-center mx-auto">
                <span className="text-green-400 text-2xl">✓</span>
              </div>
              <div>
                <p className="text-white font-bold text-xl">Revisión completada</p>
                <p className="text-gray-400 text-sm mt-1">{zeroRows.length} canciones revisadas</p>
              </div>
              <button
                onClick={() => handleFinish(workbook)}
                className="w-full bg-green-500 hover:bg-green-400 text-gray-950 font-semibold py-4 rounded-2xl transition-all text-lg"
              >
                ⬇ Descargar Hot 100 Final.xlsx
              </button>
            </div>
          )}
        </div>

        {/* Derecha sticky: navegación + override */}
        <div className="flex flex-col gap-3 sticky top-6">
          {/* Contador y navegación */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-col gap-3">
            <div className="text-center">
              <p className="text-3xl font-bold text-white">
                {Math.min(currentIndex + 1, zeroRows.length)}
                <span className="text-gray-600 text-xl"> / {zeroRows.length}</span>
              </p>
              <p className="text-gray-600 text-xs mt-0.5">canciones</p>
            </div>
            <button
              onClick={prevRow}
              disabled={currentIndex === 0}
              className={`w-full font-semibold py-2.5 px-4 rounded-xl transition-all text-sm border ${
                currentIndex === 0
                  ? "border-gray-800 text-gray-700 cursor-not-allowed"
                  : "border-gray-700 bg-gray-800 hover:bg-gray-700 text-gray-400"
              }`}
            >
              ← Anterior
            </button>
          </div>

          {isDone ? null : (
            <button
              onClick={handleAbort}
              className="w-full bg-red-500 bg-opacity-10 hover:bg-opacity-20 border border-red-900 text-red-400 font-semibold py-3 px-4 rounded-2xl transition-all text-sm"
            >
              Terminar ahora
            </button>
          )}

          {/* Override panel */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <button
              onClick={() => setOverrideOpen((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-left"
            >
              <div>
                <p className="text-white font-semibold text-xs">Corregir manualmente</p>
                <p className="text-gray-600 text-[11px] mt-0.5">Cualquier canción del top 100</p>
              </div>
              <span className="text-gray-400 text-lg ml-2">{overrideOpen ? "−" : "+"}</span>
            </button>

            {overrideOpen && (
              <div className="border-t border-gray-800 p-4 flex flex-col gap-4">
                {/* Luminate search */}
                <div>
                  <p className="text-xs text-gray-400 mb-2">1. Canción en Luminate</p>
                  {overrideLum ? (
                    <div className="flex items-center justify-between bg-gray-800 border border-green-700 rounded-xl px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-xs text-green-300 font-medium truncate">{overrideLum.title}</p>
                        <p className="text-[10px] text-gray-400 truncate">{overrideLum.artist}</p>
                      </div>
                      <button
                        onClick={() => { setOverrideLum(null); setOverrideLumQuery(""); }}
                        className="text-[10px] text-gray-400 hover:text-white ml-2 flex-shrink-0"
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
                        placeholder="Buscar título o artista…"
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white text-xs focus:outline-none focus:border-green-500"
                      />
                      {lumResults.length > 0 && (
                        <div className="mt-1.5 flex flex-col gap-1 max-h-48 overflow-y-auto">
                          {lumResults.map(({ row, i }) => (
                            <button
                              key={i}
                              onClick={() => setOverrideLum({ rowNum: i + 2, i, title: row[titleKey], artist: row[artistKey] })}
                              className="flex items-center justify-between px-3 py-2 rounded-lg border border-gray-800 hover:border-gray-600 text-left"
                            >
                              <div className="min-w-0">
                                <p className="text-xs text-gray-200 truncate">{row[titleKey]}</p>
                                <p className="text-[10px] text-gray-500 truncate">{row[artistKey]}</p>
                              </div>
                              <span className="text-[10px] text-gray-600 ml-2 flex-shrink-0">#{i + 1}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Colombia Radio search */}
                {overrideLum && (
                  <div>
                    <p className="text-xs text-gray-400 mb-2">2. Reemplazar con</p>
                    {overrideCol ? (
                      <div className="flex items-center justify-between bg-gray-800 border border-orange-700 rounded-xl px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-xs text-orange-300 font-medium truncate">{overrideCol.CANCION}</p>
                          <p className="text-[10px] text-gray-500">
                            {Number(overrideCol.IMPACTOS ?? 0).toLocaleString()} imp
                          </p>
                        </div>
                        <button
                          onClick={() => { setOverrideCol(null); setOverrideColQuery(""); }}
                          className="text-[10px] text-gray-400 hover:text-white ml-2 flex-shrink-0"
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
                          placeholder="Buscar en Colombia Radio…"
                          className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white text-xs focus:outline-none focus:border-orange-500"
                        />
                        {colResults.length > 0 && (
                          <div className="mt-1.5 flex flex-col gap-1 max-h-48 overflow-y-auto">
                            {colResults.map((r, i) => (
                              <button
                                key={i}
                                onClick={() => setOverrideCol(r)}
                                className="flex items-center justify-between px-3 py-2 rounded-lg border border-gray-800 hover:border-gray-600 text-left"
                              >
                                <div className="min-w-0">
                                  <p className="text-xs text-gray-200 truncate">{r.CANCION}</p>
                                  <p className="text-[10px] text-gray-500 truncate">{r.ARTISTA}</p>
                                </div>
                                <div className="flex flex-col items-end text-[10px] text-gray-500 ml-2 flex-shrink-0">
                                  <span>{Number(r.IMPACTOS ?? 0).toLocaleString()}</span>
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

                {overrideLum && overrideCol && (
                  <button
                    onClick={applyOverride}
                    className="w-full bg-green-500 hover:bg-green-400 text-gray-950 font-semibold py-2.5 rounded-xl transition-all text-sm"
                  >
                    Aplicar corrección
                  </button>
                )}

                {overrideLog.length > 0 && (
                  <div className="border-t border-gray-800 pt-3">
                    <p className="text-[10px] text-gray-500 mb-2">
                      Correcciones aplicadas ({overrideLog.length})
                    </p>
                    <div className="flex flex-col gap-1">
                      {overrideLog.map((e, i) => (
                        <div
                          key={i}
                          className="text-[10px] px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-lg"
                        >
                          <span className="text-gray-300 truncate block">{e.title}</span>
                          <span className="text-orange-400 truncate block">→ {e.chosen.CANCION}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
