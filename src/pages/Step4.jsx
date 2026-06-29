import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import XLSX from "xlsx-js-style";
import { saveAs } from "file-saver";
import useStore from "../store/useStore";
import { startSpotifySearch } from "../utils/api";

function parseSongsFromBuffer(buffer) {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets["Luminate"];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json(sheet);
  return rows.slice(0, 100).map((row, i) => {
    const keys = Object.keys(row);
    const titleKey  = keys.find((k) => k.toUpperCase() === "TITLE")   ?? "TITLE";
    const artistKey = keys.find((k) => k.toUpperCase() === "ARTIST")  ?? "ARTIST";
    const songIdKey = keys.find((k) => k.toUpperCase() === "SONG_ID") ?? "SONG_ID";
    return {
      rank:             i + 1,
      title:            String(row[titleKey]  ?? ""),
      artist:           String(row[artistKey] ?? ""),
      luminate_song_id: String(row[songIdKey] ?? "") || null,
      tot_with_radio:   Number(row["Tot w/ Radio"]     ?? 0),
      radio_impact:     Number(row["Radio Impact Col"] ?? 0),
      consumption:      Number(row["Consumption"]      ?? 0),
      radio_pct:        Number(row["Radio %"]          ?? 0),
    };
  });
}

function spotifyIdFromUrl(url) {
  if (!url) return null;
  const m = String(url).match(/track\/([A-Za-z0-9]+)/);
  return m ? m[1] : null;
}

const API = "http://localhost:3005";

// El usuario sube el chart de la semana anterior: la fecha guardada es el
// lunes de la semana pasada respecto a hoy (ej. hoy lunes 29 jun → 22 jun).
function previousChartMonday(today = new Date()) {
  const d = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;     // 0 si hoy es lunes
  d.setUTCDate(d.getUTCDate() - daysSinceMonday - 7);  // lunes de la semana pasada
  return d.toISOString().slice(0, 10);
}

async function saveWeeklyRanking(songs, spotifyResults) {
  const week_date = previousChartMonday();
  const spotifyMap = new Map(
    (spotifyResults ?? []).map((r) => [String(r.rank), spotifyIdFromUrl(r.spotify_url)]),
  );
  const payload = songs.map((s) => ({
    position:         s.rank,
    title:            s.title,
    artist:           s.artist,
    luminate_song_id: s.luminate_song_id ?? null,
    spotify_id:       spotifyMap.get(String(s.rank)) ?? null,
    tot_with_radio:   s.tot_with_radio,
    radio_impact:     s.radio_impact,
    consumption:      s.consumption,
    radio_pct:        s.radio_pct,
  }));
  await fetch(`${API}/api/weekly-ranking`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ week_date, songs: payload }),
  });
}

function isoWeek(dateStr) {
  const d = new Date(dateStr);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const wn = 1 + Math.round(((d - jan4) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(wn).padStart(2, "0")}`;
}

async function fetchAndExportComparison() {
  const res = await fetch(`${API}/api/weekly-ranking/compare`);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error ?? "Error al obtener comparación");
  }
  const { currentWeek, rows } = await res.json();
  const semana = isoWeek(currentWeek);
  const data = rows.map((r) => ({
    THIS_WEEK:         Number(r.this_week),
    LAST_WEEK:         r.last_week != null ? Number(r.last_week) : "",
    SONG:              r.song,
    Artists:           r.artists,
    Posicion:          r.posicion != null ? Number(r.posicion) : "",
    Youtube:           "",
    Spotify:           r.spotify_url ?? "",
    "Apple Music":     "",
    Semana:            semana,
    Cover:             "",
    WeekNum:           r.week_count != null ? Number(r.week_count) : "",
    "Album Cover URL": r.cover_url ?? "",
    Reentry:           Number(r.reentry ?? 0),
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  ws["!cols"] = [
    { wch: 10 }, { wch: 10 }, { wch: 42 }, { wch: 38 },
    { wch: 10 }, { wch: 50 }, { wch: 55 }, { wch: 50 },
    { wch: 10 }, { wch: 8  }, { wch: 9  }, { wch: 55 }, { wch: 8 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const dateStr = String(currentWeek).slice(0, 10);
  saveAs(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `Hot 100 Comparacion ${dateStr}.xlsx`,
  );
}

function exportResults(results) {
  const wb = XLSX.utils.book_new();
  const rows = results.map((r) => ({
    Rank:               r.rank,
    "Título Luminate":  r.luminate_title,
    "Artista Luminate": r.luminate_artist,
    "Título Spotify":   r.spotify_title ?? "",
    "Artista Spotify":  r.spotify_artist ?? "",
    "URL Spotify":      r.spotify_url ?? "",
    "Cover URL":        r.cover_url ?? "",
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [
    { wch: 6 }, { wch: 40 }, { wch: 35 },
    { wch: 40 }, { wch: 35 }, { wch: 55 }, { wch: 55 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Spotify Names");
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  saveAs(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    "Hot 100 Spotify Names.xlsx",
  );
}

export default function Step4() {
  const navigate = useNavigate();
  const { finalBuffer } = useStore();

  const [songs, setSongs] = useState([]);
  const [phase, setPhase] = useState("ready"); // ready | running | done
  const [progress, setProgress] = useState({ index: 0, total: 0, song: "" });
  const [results, setResults] = useState([]);
  const [compareSaving, setCompareSaving] = useState("idle");
  const [compareExporting, setCompareExporting] = useState(false);
  const resultsRef = useRef([]);
  const [editingIdx, setEditingIdx] = useState(null);
  const [editValues, setEditValues] = useState({ title: "", artist: "" });
  const autoStartedRef = useRef(false);

  const startEdit = (i, r) => {
    setEditingIdx(i);
    setEditValues({ title: r.spotify_title ?? r.luminate_title, artist: r.spotify_artist ?? r.luminate_artist });
  };

  const commitEdit = (i) => {
    setResults((prev) => prev.map((r, idx) =>
      idx === i ? { ...r, spotify_title: editValues.title, spotify_artist: editValues.artist } : r
    ));
    setEditingIdx(null);
  };

  useEffect(() => {
    if (!finalBuffer) return;
    try { setSongs(parseSongsFromBuffer(finalBuffer)); }
    catch (e) { console.error("Error parseando finalBuffer:", e); }
  }, [finalBuffer]);

  useEffect(() => {
    if (songs.length > 0 && phase === "ready" && !autoStartedRef.current) {
      autoStartedRef.current = true;
      handleStart();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songs]);

  if (!finalBuffer) {
    return (
      <div className="grid grid-cols-[1fr_280px] gap-6 items-start">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
          <p className="text-gray-400 text-sm">
            Primero debes completar el paso 2 para generar el Hot 100 Final.
          </p>
        </div>
        <div className="sticky top-6">
          <button
            onClick={() => navigate("/step2")}
            className="w-full bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-400 font-semibold py-3 px-6 rounded-2xl transition-all text-sm"
          >
            ← Ir al paso 2
          </button>
        </div>
      </div>
    );
  }

  const handleStart = () => {
    if (phase === "running") return;
    setPhase("running");
    setResults([]);
    resultsRef.current = [];
    setProgress({ index: 0, total: songs.length, song: "" });

    const payload = songs.map(({ title, artist, luminate_song_id }) => ({
      song_id: luminate_song_id, title, artist,
    }));

    startSpotifySearch(payload, {
      onProgress: (index, total, song) => setProgress({ index, total, song }),
      onResult: (entry) => {
        resultsRef.current = [...resultsRef.current, entry];
        setResults([...resultsRef.current]);
      },
      onDone: () => {
        setPhase("done");
        setCompareSaving("saving");
        saveWeeklyRanking(songs, resultsRef.current)
          .then(() => setCompareSaving("saved"))
          .catch(() => setCompareSaving("error"));
      },
      onError: (err) => {
        console.error("Spotify search error:", err);
        setPhase("done");
      },
    });
  };

  const pct = progress.total > 0 ? (progress.index / progress.total) * 100 : 0;
  const found = results.filter((r) => r.spotify_url).length;

  return (
    <div className="grid grid-cols-[1fr_280px] gap-6 items-start">
      {/* Columna izquierda: lista de canciones / resultados */}
      <div className="flex flex-col gap-4 min-w-0">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">Estandarizar nombres</h2>
          <p className="text-gray-400 text-sm">
            Busca los nombres canónicos de las 100 canciones en Spotify
          </p>
        </div>

        {/* Lista de resultados / preview */}
        {results.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {results.map((r, i) => {
              const notFound = !r.spotify_url;
              const isEditing = editingIdx === i;
              return (
                <div
                  key={i}
                  className={`border rounded-xl flex items-center gap-3 px-4 py-2.5 group transition-colors ${
                    notFound
                      ? "bg-red-950/20 border-red-900/40"
                      : "bg-gray-900 border-gray-800"
                  }`}
                >
                  {/* Cover */}
                  <div className="flex-shrink-0 w-9 h-9 rounded-lg overflow-hidden bg-gray-800 flex items-center justify-center">
                    {r.cover_url ? (
                      <img src={r.cover_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className={`text-xs ${notFound ? "text-gray-700" : "text-gray-600"}`}>♪</span>
                    )}
                  </div>

                  {/* Rank */}
                  <span className="text-gray-600 text-xs w-5 text-right flex-shrink-0 font-mono">
                    {r.rank}
                  </span>

                  {/* Nombres — editable */}
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <div className="flex flex-col gap-1">
                        <input
                          autoFocus
                          value={editValues.title}
                          onChange={(e) => setEditValues((v) => ({ ...v, title: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === "Enter") commitEdit(i); if (e.key === "Escape") setEditingIdx(null); }}
                          className="w-full bg-gray-800 border border-green-700 rounded-lg px-2 py-1 text-white text-sm focus:outline-none"
                        />
                        <input
                          value={editValues.artist}
                          onChange={(e) => setEditValues((v) => ({ ...v, artist: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === "Enter") commitEdit(i); if (e.key === "Escape") setEditingIdx(null); }}
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-gray-400 text-xs focus:outline-none focus:border-green-700"
                        />
                      </div>
                    ) : (
                      <div
                        className="cursor-text"
                        onClick={() => startEdit(i, r)}
                        title="Clic para editar"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {r.spotify_title && r.spotify_title !== r.luminate_title ? (
                            <>
                              <p className="text-xs text-gray-500 truncate max-w-[35%]">{r.luminate_title}</p>
                              <span className="text-gray-700 flex-shrink-0 text-xs">→</span>
                              <p className="text-sm text-white font-medium truncate">{r.spotify_title}</p>
                            </>
                          ) : (
                            <p className={`text-sm font-medium truncate ${notFound ? "text-red-400/70" : "text-white"}`}>
                              {r.spotify_title ?? r.luminate_title}
                            </p>
                          )}
                          <span className="text-gray-700 text-xs opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">✎</span>
                        </div>
                        <p className="text-xs text-gray-500 truncate mt-0.5">
                          {r.spotify_artist ?? r.luminate_artist}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Acciones */}
                  <div className="flex-shrink-0 flex items-center gap-2">
                    {isEditing ? (
                      <>
                        <button
                          onClick={() => commitEdit(i)}
                          className="text-green-400 hover:text-green-300 text-xs font-semibold"
                        >
                          OK
                        </button>
                        <button
                          onClick={() => setEditingIdx(null)}
                          className="text-gray-600 hover:text-gray-400 text-xs"
                        >
                          ✕
                        </button>
                      </>
                    ) : r.spotify_url ? (
                      <a
                        href={r.spotify_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-green-600 hover:text-green-400 text-xs"
                        onClick={(e) => e.stopPropagation()}
                      >
                        ↗
                      </a>
                    ) : (
                      <span className="text-red-500/50 text-[10px]">no encontrado</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : phase === "ready" ? (
          /* Preview de canciones antes de buscar */
          <div className="flex flex-col gap-1.5">
            {songs.map((s, i) => (
              <div
                key={i}
                className="bg-gray-900 border border-gray-800 rounded-xl flex items-center gap-3 px-4 py-2.5"
              >
                <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-gray-800 flex items-center justify-center">
                  <span className="text-gray-700 text-xs">♪</span>
                </div>
                <span className="text-gray-600 text-xs w-5 text-right flex-shrink-0 font-mono">{s.rank}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-300 truncate">{s.title}</p>
                  <p className="text-xs text-gray-600 truncate">{s.artist}</p>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* Columna derecha: acciones sticky */}
      <div className="flex flex-col gap-3 sticky top-6">
        {/* Estado general */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider">
              {phase === "ready" ? "Listo" : phase === "running" ? "Buscando..." : "Completado"}
            </p>
            {phase === "done" && <span className="text-green-400 text-xs font-bold">✓</span>}
          </div>

          {phase === "ready" && (
            <div className="text-center py-1">
              <p className="text-3xl font-bold text-white">{songs.length}</p>
              <p className="text-gray-500 text-xs mt-0.5">canciones</p>
            </div>
          )}

          {(phase === "running" || phase === "done") && (
            <>
              {/* Barra de progreso */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400">{progress.index} / {progress.total}</span>
                  <span className="text-gray-600">{Math.round(pct)}%</span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-1.5">
                  <div
                    className="bg-green-500 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              {phase === "running" && progress.song && (
                <p className="text-[11px] text-gray-500 truncate">{progress.song}</p>
              )}

              {phase === "done" && results.length > 0 && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="bg-gray-800 rounded-xl p-2.5 text-center">
                    <p className="text-lg font-bold text-green-400">{found}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">encontradas</p>
                  </div>
                  <div className="bg-gray-800 rounded-xl p-2.5 text-center">
                    <p className="text-lg font-bold text-gray-400">{results.length - found}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">no encontradas</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Botón principal */}
        {phase === "ready" && (
          <button
            onClick={handleStart}
            className="w-full bg-green-500 hover:bg-green-400 text-gray-950 font-semibold py-4 px-6 rounded-2xl transition-all text-lg"
          >
            Iniciar búsqueda →
          </button>
        )}

        {/* Exportar Spotify Names */}
        {phase === "done" && (
          <button
            onClick={() => exportResults(results)}
            className="w-full bg-green-500 hover:bg-green-400 text-gray-950 font-semibold py-4 px-6 rounded-2xl transition-all text-base"
          >
            ⬇ Exportar Spotify Names.xlsx
          </button>
        )}

        {/* Comparación semanal */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-col gap-3">
          <div>
            <p className="text-white text-xs font-semibold">Comparación semanal</p>
            <p className={`text-[11px] mt-0.5 ${
              compareSaving === "saved"  ? "text-green-400" :
              compareSaving === "error"  ? "text-red-400"   :
              compareSaving === "saving" ? "text-gray-400"  : "text-gray-600"
            }`}>
              {compareSaving === "saving" && "Guardando semana actual..."}
              {compareSaving === "saved"  && "✓ Semana guardada en BD"}
              {compareSaving === "error"  && "✗ Error al guardar"}
              {compareSaving === "idle"   && "Descarga el archivo de comparación"}
            </p>
          </div>
          <button
            onClick={async () => {
              setCompareExporting(true);
              try { await fetchAndExportComparison(); }
              catch (e) { alert(e.message); }
              finally { setCompareExporting(false); }
            }}
            disabled={compareExporting || compareSaving === "saving"}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-xl transition-all text-sm"
          >
            {compareExporting ? "Generando..." : "⬇ Comparación.xlsx"}
          </button>
        </div>

        <div className="border-t border-gray-800 pt-3">
          <button
            onClick={() => navigate("/step3")}
            className="w-full bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-400 font-semibold py-3 px-6 rounded-2xl transition-all text-sm"
          >
            ← Volver al reporte
          </button>
        </div>
      </div>
    </div>
  );
}
