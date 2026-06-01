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
    const titleKey = keys.find((k) => k.toUpperCase() === "TITLE") ?? "TITLE";
    const artistKey = keys.find((k) => k.toUpperCase() === "ARTIST") ?? "ARTIST";
    return { rank: i + 1, title: String(row[titleKey] ?? ""), artist: String(row[artistKey] ?? "") };
  });
}

function exportResults(results) {
  const wb = XLSX.utils.book_new();
  const rows = results.map((r) => ({
    Rank: r.rank,
    "Título Luminate": r.luminate_title,
    "Artista Luminate": r.luminate_artist,
    "Título Spotify": r.spotify_title ?? "",
    "Artista Spotify": r.spotify_artist ?? "",
    "URL Spotify": r.spotify_url ?? "",
    "Cover URL": r.cover_url ?? "",
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

  const [songs, setSongs] = useState([]); // [{rank, title, artist}]
  const [phase, setPhase] = useState("ready"); // ready | running | done
  const [progress, setProgress] = useState({ index: 0, total: 0, song: "" });
  const [results, setResults] = useState([]); // [entry]
  const resultsRef = useRef([]);

  useEffect(() => {
    if (!finalBuffer) return;
    try {
      setSongs(parseSongsFromBuffer(finalBuffer));
    } catch (e) {
      console.error("Error parseando finalBuffer:", e);
    }
  }, [finalBuffer]);

  if (!finalBuffer) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">Estandarizar nombres</h2>
          <p className="text-gray-400 text-sm">
            Primero debes completar el paso 2 para generar el Hot 100 Final.
          </p>
        </div>
        <button
          onClick={() => navigate("/step2")}
          className="w-full bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-400 font-semibold py-3 px-6 rounded-2xl transition-all text-sm"
        >
          ← Ir al paso 2
        </button>
      </div>
    );
  }

  const handleStart = () => {
    if (phase === "running") return;
    setPhase("running");
    setResults([]);
    resultsRef.current = [];
    setProgress({ index: 0, total: songs.length, song: "" });

    const payload = songs.map(({ title, artist }) => ({ title, artist }));

    startSpotifySearch(payload, {
      onProgress: (index, total, song) => setProgress({ index, total, song }),
      onResult: (entry) => {
        resultsRef.current = [...resultsRef.current, entry];
        setResults([...resultsRef.current]);
      },
      onDone: () => setPhase("done"),
      onError: (err) => {
        console.error("Spotify search error:", err);
        setPhase("done");
      },
    });
  };

  const pct = progress.total > 0 ? (progress.index / progress.total) * 100 : 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">Estandarizar nombres</h2>
          <p className="text-gray-400 text-sm">
            Busca los nombres canónicos de las 100 canciones en Spotify
          </p>
        </div>
        {phase === "done" && (
          <span className="text-green-400 font-semibold text-sm">
            ✓ Completado
          </span>
        )}
      </div>

      {/* Resumen y botón de inicio */}
      {phase === "ready" && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-semibold">{songs.length} canciones listas</p>
              <p className="text-gray-500 text-xs mt-1">
                Las canciones ya buscadas anteriormente se resuelven desde caché (instantáneo)
              </p>
            </div>
            <div className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-center">
              <p className="text-2xl font-bold text-white">{songs.length}</p>
              <p className="text-xs text-gray-500">canciones</p>
            </div>
          </div>
          <button
            onClick={handleStart}
            className="w-full bg-green-500 hover:bg-green-400 text-gray-950 font-semibold py-4 rounded-2xl transition-all text-lg"
          >
            Iniciar búsqueda →
          </button>
        </div>
      )}

      {/* Progreso */}
      {(phase === "running" || phase === "done") && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-white font-semibold text-sm">
              {phase === "running" ? "Buscando en Spotify..." : "Búsqueda completada"}
            </p>
            <p className="text-gray-400 text-sm">
              {progress.index} / {progress.total}
            </p>
          </div>

          <div className="w-full bg-gray-800 rounded-full h-1.5">
            <div
              className="bg-green-500 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>

          {phase === "running" && progress.song && (
            <p className="text-xs text-gray-500 truncate">{progress.song}</p>
          )}
        </div>
      )}

      {/* Resultados */}
      {results.length > 0 && (
        <div className="flex flex-col gap-2">
          {results.map((r, i) => (
            <div
              key={i}
              className="bg-gray-900 border border-gray-800 rounded-xl flex items-center gap-4 px-4 py-3"
            >
              {/* Cover */}
              <div className="flex-shrink-0 w-10 h-10 rounded-lg overflow-hidden bg-gray-800 flex items-center justify-center">
                {r.cover_url ? (
                  <img src={r.cover_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-gray-600 text-xs">♪</span>
                )}
              </div>

              {/* Rank */}
              <span className="text-gray-600 text-xs w-6 text-right flex-shrink-0">
                {r.rank}
              </span>

              {/* Nombres */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-xs text-gray-500 truncate">{r.luminate_title}</p>
                  {r.spotify_title && r.spotify_title !== r.luminate_title && (
                    <>
                      <span className="text-gray-700 flex-shrink-0">→</span>
                      <p className="text-sm text-white font-medium truncate">{r.spotify_title}</p>
                    </>
                  )}
                  {r.spotify_title && r.spotify_title === r.luminate_title && (
                    <span className="text-gray-600 text-xs flex-shrink-0">= mismo</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 truncate mt-0.5">
                  {r.spotify_artist ?? r.luminate_artist}
                </p>
              </div>

              {/* Estado */}
              <div className="flex-shrink-0 flex items-center gap-2">
                {r.spotify_url ? (
                  <a
                    href={r.spotify_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-green-500 hover:text-green-400 text-xs font-semibold"
                  >
                    Spotify ↗
                  </a>
                ) : (
                  <span className="text-gray-700 text-xs">No encontrado</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Botones finales */}
      <div className="flex flex-col gap-3">
        {phase === "done" && (
          <button
            onClick={() => exportResults(results)}
            className="w-full bg-green-500 hover:bg-green-400 text-gray-950 font-semibold py-4 px-6 rounded-2xl transition-all text-lg"
          >
            ⬇ Exportar Hot 100 Spotify Names.xlsx
          </button>
        )}
        <button
          onClick={() => navigate("/step3")}
          className="w-full bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-400 font-semibold py-3 px-6 rounded-2xl transition-all text-sm"
        >
          ← Volver al reporte
        </button>
      </div>
    </div>
  );
}
