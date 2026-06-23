import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import XLSX from "xlsx-js-style";
import { startSpotifySearch } from "../utils/api";

const API = (path, opts = {}) => {
  const token = localStorage.getItem("admin_token");
  return fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.headers ?? {}),
    },
  });
};

const TABS = ["Dashboard", "Cargar Hot 100", "Top Mensual", "Songs", "Weekly Tops", "Song Map", "Spotify Cache"];

export default function Admin() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("Dashboard");

  useEffect(() => {
    const token = localStorage.getItem("admin_token");
    if (!token) navigate("/admin/login");
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem("admin_token");
    navigate("/admin/login");
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center font-bold text-gray-950 text-sm">
            H
          </div>
          <span className="font-bold text-lg tracking-tight">
            Hot 100 · Admin
          </span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/")}
            className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            ← App
          </button>
          <button
            onClick={handleLogout}
            className="text-sm text-red-400 hover:text-red-300 transition-colors"
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-gray-800 px-8">
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                tab === t
                  ? "border-green-500 text-white"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="max-w-[1400px] mx-auto px-8 py-8">
        {tab === "Dashboard" && <DashboardTab />}
        {tab === "Cargar Hot 100" && <CargarHot100Tab />}
        {tab === "Top Mensual" && <TopMensualTab />}
        {tab === "Songs" && <SongsTab />}
        {tab === "Weekly Tops" && <WeeklyTopsTab />}
        {tab === "Song Map" && <SongMapTab />}
        {tab === "Spotify Cache" && <SpotifyCacheTab />}
      </main>
    </div>
  );
}

// ── Cargar Hot 100 ────────────────────────────────────────────────────────────

function parseSongsFromXlsx(buffer) {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets["Luminate"];
  if (!sheet) throw new Error("El archivo no tiene hoja 'Luminate'");
  const rows = XLSX.utils.sheet_to_json(sheet);
  return rows.map((row, i) => {
    const keys = Object.keys(row);
    const titleKey  = keys.find((k) => k.toUpperCase() === "TITLE")   ?? "TITLE";
    const artistKey = keys.find((k) => k.toUpperCase() === "ARTIST")  ?? "ARTIST";
    const songIdKey = keys.find((k) => k.toUpperCase() === "SONG_ID") ?? "SONG_ID";
    return {
      rank:             i < 100 ? i + 1 : null, // posición solo para el top 100
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

function CargarHot100Tab() {
  const [songs, setSongs] = useState([]);
  const [fileName, setFileName] = useState(null);
  const [weekDate, setWeekDate] = useState(new Date().toISOString().slice(0, 10));
  const [withSpotify, setWithSpotify] = useState(false);
  const [phase, setPhase] = useState("idle"); // idle | spotify | saving | done | error
  const [progress, setProgress] = useState({ index: 0, total: 0, song: "" });
  const [spotifyResults, setSpotifyResults] = useState([]);
  const [saveResult, setSaveResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const spotifyResultsRef = useRef([]);

  const handleFile = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = parseSongsFromXlsx(e.target.result);
        if (parsed.length === 0) throw new Error("No se encontraron filas en la hoja Luminate");
        setSongs(parsed);
        setFileName(file.name);
        setPhase("idle");
        setSaveResult(null);
        setSpotifyResults([]);
        spotifyResultsRef.current = [];
      } catch (err) {
        alert("Error al leer el archivo: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const saveToDb = async (spotifyMap = new Map()) => {
    setPhase("saving");
    const payload = songs.map((s) => ({
      position:         s.rank ?? null,
      title:            s.title,
      artist:           s.artist,
      luminate_song_id: s.luminate_song_id ?? null,
      spotify_id:       s.rank != null ? (spotifyMap.get(String(s.rank)) ?? null) : null,
      tot_with_radio:   s.tot_with_radio,
      radio_impact:     s.radio_impact,
      consumption:      s.consumption,
      radio_pct:        s.radio_pct,
    }));
    try {
      let res;
      try {
        res = await API("/api/weekly-ranking", {
          method: "POST",
          body: JSON.stringify({ week_date: weekDate, songs: payload }),
        });
      } catch (networkErr) {
        throw new Error("No se pudo conectar con el servidor. Verifica que esté corriendo.");
      }
      if (res.status === 413) {
        throw new Error(`Payload demasiado grande (${songs.length} canciones). Contacta al admin para subir el límite del servidor.`);
      }
      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error(`Error inesperado del servidor (HTTP ${res.status})`);
      }
      if (!res.ok) throw new Error(data.error ?? `Error del servidor (HTTP ${res.status})`);
      setSaveResult({ ok: true, saved: data.saved });
      setPhase("done");
    } catch (err) {
      setSaveResult({ ok: false, error: err.message });
      setPhase("error");
    }
  };

  const handleGuardar = () => {
    if (songs.length === 0 || !weekDate) return;
    if (withSpotify) {
      setPhase("spotify");
      setSpotifyResults([]);
      spotifyResultsRef.current = [];
      setProgress({ index: 0, total: 0, song: "" });
      const payload = songs.map(({ title, artist, luminate_song_id }) => ({
        song_id: luminate_song_id, title, artist,
      }));
      startSpotifySearch(payload, {
        onProgress: (index, total, song) => setProgress({ index, total, song }),
        onResult: (entry) => {
          spotifyResultsRef.current = [...spotifyResultsRef.current, entry];
          setSpotifyResults([...spotifyResultsRef.current]);
        },
        onDone: () => {
          const spotifyMap = new Map(
            spotifyResultsRef.current.map((r) => [String(r.rank), spotifyIdFromUrl(r.spotify_url)])
          );
          saveToDb(spotifyMap);
        },
        onError: (err) => {
          setSaveResult({ ok: false, error: "Error en búsqueda Spotify: " + err.message });
          setPhase("error");
        },
      });
    } else {
      saveToDb();
    }
  };

  const pct = progress.total > 0 ? Math.round((progress.index / progress.total) * 100) : 0;
  const isWorking = phase === "spotify" || phase === "saving";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold">Cargar Hot 100</h2>
        <p className="text-gray-500 text-sm mt-1">
          Carga un Hot 100 Final.xlsx ya procesado y guárdalo en la base de datos.
        </p>
      </div>

      <div className="grid grid-cols-[1fr_300px] gap-6 items-start">
        {/* Izquierda: dropzone + preview */}
        <div className="flex flex-col gap-4">
          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => document.getElementById("admin-hot100-input").click()}
            className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${
              dragOver ? "border-green-500 bg-green-950/20" : "border-gray-700 hover:border-gray-500"
            }`}
          >
            <input
              id="admin-hot100-input"
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => { if (e.target.files[0]) handleFile(e.target.files[0]); e.target.value = ""; }}
            />
            {fileName ? (
              <div className="flex flex-col gap-1">
                <p className="text-green-400 font-medium text-sm">{fileName}</p>
                <p className="text-gray-500 text-xs">{songs.length} canciones cargadas · clic para cambiar</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-gray-400 text-sm font-medium">Arrastra el Hot 100 Final.xlsx aquí</p>
                <p className="text-gray-600 text-xs">o haz clic para seleccionar</p>
              </div>
            )}
          </div>

          {/* Preview top 10 */}
          {songs.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
                <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Vista previa — Top 10</span>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-green-400">{Math.min(songs.length, 100)} en weekly_tops</span>
                  <span className="text-gray-600">{songs.length} en songs</span>
                </div>
              </div>
              <div className="divide-y divide-gray-800/60">
                {songs.slice(0, 10).map((s) => (
                  <div key={s.rank} className="flex items-center gap-3 px-5 py-2.5">
                    <span className="text-gray-600 text-xs w-5 text-right font-mono flex-shrink-0">{s.rank}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{s.title}</p>
                      <p className="text-xs text-gray-500 truncate">{s.artist}</p>
                    </div>
                    {s.tot_with_radio > 0 && (
                      <span className="text-gray-600 text-xs tabular-nums flex-shrink-0">
                        {s.tot_with_radio.toLocaleString("es-CO")}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Progreso Spotify */}
          {phase === "spotify" && (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-col gap-2">
              <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Buscando en Spotify...</p>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{progress.index} / {progress.total}</span>
                <span>{pct}%</span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-1.5">
                <div className="bg-green-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
              </div>
              {progress.song && <p className="text-[11px] text-gray-600 truncate">{progress.song}</p>}
            </div>
          )}

          {/* Resultado */}
          {saveResult && (
            <div className={`border rounded-2xl p-4 ${saveResult.ok ? "bg-green-950/30 border-green-800" : "bg-red-950/30 border-red-800"}`}>
              <p className={`text-sm font-medium ${saveResult.ok ? "text-green-400" : "text-red-400"}`}>
                {saveResult.ok
                  ? `✓ Guardado — ${Math.min(songs.length, 100)} en weekly_tops, ${saveResult.saved} en songs`
                  : `✗ Error: ${saveResult.error}`}
              </p>
              {saveResult.ok && withSpotify && (
                <p className="text-xs text-gray-500 mt-1">
                  Spotify: {spotifyResults.filter((r) => r.spotify_url).length} de {spotifyResults.length} encontradas
                </p>
              )}
            </div>
          )}
        </div>

        {/* Derecha: configuración sticky */}
        <div className="flex flex-col gap-4 sticky top-6">
          {/* Fecha */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-col gap-3">
            <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Fecha de la semana</p>
            <input
              type="date"
              value={weekDate}
              onChange={(e) => setWeekDate(e.target.value)}
              disabled={isWorking}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-green-500 disabled:opacity-50"
            />
            <p className="text-gray-600 text-xs">
              Fecha que corresponde a este ranking (ej. lunes de esa semana).
            </p>
          </div>

          {/* Toggle Spotify */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white font-medium">Buscar en Spotify</p>
                <p className="text-gray-600 text-xs mt-0.5">Opcional — portadas y URLs</p>
              </div>
              <button
                onClick={() => !isWorking && setWithSpotify((v) => !v)}
                disabled={isWorking}
                className={`w-10 h-6 rounded-full transition-colors relative flex-shrink-0 ${withSpotify ? "bg-green-500" : "bg-gray-700"} disabled:opacity-50`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-200 ${withSpotify ? "left-4" : "left-0.5"}`} />
              </button>
            </div>
            {withSpotify && (
              <p className="text-yellow-500/70 text-xs">
                Las canciones ya en caché se usan sin llamar a la API de Spotify.
              </p>
            )}
          </div>

          {/* Botón */}
          <button
            onClick={handleGuardar}
            disabled={songs.length === 0 || !weekDate || isWorking}
            className={`w-full font-semibold py-4 px-6 rounded-2xl transition-all text-base ${
              songs.length > 0 && weekDate && !isWorking
                ? "bg-green-500 hover:bg-green-400 text-gray-950"
                : "bg-gray-700 text-gray-500 cursor-not-allowed"
            }`}
          >
            {phase === "spotify" ? `Spotify... ${pct}%` :
             phase === "saving" ? "Guardando en BD..." :
             "Guardar semana en BD"}
          </button>

          {(phase === "done" || phase === "error") && (
            <button
              onClick={() => {
                setSongs([]);
                setFileName(null);
                setPhase("idle");
                setSaveResult(null);
                setSpotifyResults([]);
                spotifyResultsRef.current = [];
              }}
              className="w-full text-sm text-gray-500 hover:text-gray-300 py-2 transition-colors"
            >
              Limpiar y cargar otro archivo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = "text-white" }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl px-6 py-5 flex flex-col gap-1">
      <span className="text-xs text-gray-500 uppercase tracking-wider">{label}</span>
      <span className={`text-3xl font-bold tabular-nums ${color}`}>{value ?? "—"}</span>
      {sub && <span className="text-xs text-gray-600">{sub}</span>}
    </div>
  );
}

function DashboardTab() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    API("/api/admin/stats")
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then((data) => { setStats(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-gray-500 text-sm">Cargando estadísticas...</p>;
  if (!stats || !stats.totalSongs) return <p className="text-red-400 text-sm">Error al cargar stats — verificá que estés autenticado.</p>;

  const spotiPct = stats.totalSongs > 0
    ? Math.round((stats.spotifyCache / stats.totalSongs) * 100)
    : 0;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-xl font-bold mb-4">Resumen de la base de datos</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Canciones" value={stats.totalSongs.toLocaleString()} sub="en catálogo" color="text-green-400" />
          <StatCard label="Semanas" value={stats.totalWeeks} sub="semanas históricas guardadas" />
          <StatCard label="Song Map" value={stats.totalSongMap.toLocaleString()} sub="mapeos Luminate ↔ Radio" />
          <StatCard
            label="Caché Spotify"
            value={`${spotiPct}%`}
            sub={`${stats.spotifyCache.toLocaleString()} de ${stats.totalSongs.toLocaleString()} canciones`}
            color={spotiPct >= 80 ? "text-green-400" : spotiPct >= 50 ? "text-yellow-400" : "text-red-400"}
          />
        </div>
      </div>

      <div>
        <h3 className="text-base font-semibold text-gray-300 mb-3">Últimas 10 semanas registradas</h3>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 text-xs">
                <th className="text-left px-5 py-3">Semana</th>
                <th className="text-right px-5 py-3">Entradas</th>
                <th className="text-right px-5 py-3">Avg Tot w/ Radio</th>
                <th className="text-left px-5 py-3">#1 de la semana</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentWeeks.map((w, i) => {
                const date = new Date(w.week_start);
                const label = date.toLocaleDateString("es-CO", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
                return (
                  <tr key={w.week_start} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/40">
                    <td className="px-5 py-3 flex items-center gap-3">
                      {i === 0 && (
                        <span className="text-xs bg-green-500/20 text-green-400 border border-green-500/30 rounded-full px-2 py-0.5">
                          Última
                        </span>
                      )}
                      <span className="text-white font-medium">{label}</span>
                      <span className="text-gray-600 text-xs">{w.week_start}</span>
                    </td>
                    <td className="px-5 py-3 text-right text-gray-400 tabular-nums">{w.entries}</td>
                    <td className="px-5 py-3 text-right text-gray-400 tabular-nums">
                      {w.avg_score ? Number(w.avg_score).toLocaleString() : "—"}
                    </td>
                    <td className="px-5 py-3 text-gray-300 text-sm">
                      {w.number_one ?? <span className="text-gray-600">—</span>}
                    </td>
                  </tr>
                );
              })}
              {stats.recentWeeks.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-gray-600">
                    No hay semanas registradas aún
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Top Mensual ───────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

function RankingTable({ rows, loaded, checkedWeeks, scoreLabel, scoreColor = "text-green-400" }) {
  const fmtScore = (n) => n != null ? Number(n).toLocaleString("es-CO") : "—";

  if (rows.length === 0) {
    if (!loaded || checkedWeeks.size === 0) return null;
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center text-gray-600 text-sm">
        Sin datos para las semanas seleccionadas
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase tracking-wider">
            <th className="text-center px-3 py-3 w-9">#</th>
            <th className="text-left px-2 py-3 w-9"></th>
            <th className="text-left px-2 py-3">Canción</th>
            <th className="text-right px-3 py-3 whitespace-nowrap">{scoreLabel}</th>
            <th className="text-right px-3 py-3 hidden sm:table-cell">Sem.</th>
            <th className="text-right px-3 py-3 hidden sm:table-cell">Mejor</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => {
            const rank = idx + 1;
            const rankColor =
              rank === 1 ? "text-yellow-400" :
              rank === 2 ? "text-gray-300" :
              rank === 3 ? "text-amber-600" :
              rank <= 10 ? "text-green-400" :
              rank <= 40 ? "text-white" : "text-gray-500";
            return (
              <tr key={r.song_id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/40">
                <td className="px-3 py-2.5 text-center">
                  <span className={`font-bold tabular-nums text-sm ${rankColor}`}>{rank}</span>
                </td>
                <td className="px-2 py-2.5">
                  {r.cover_url
                    ? <img src={r.cover_url} alt="" className="w-7 h-7 rounded object-cover" />
                    : <div className="w-7 h-7 rounded bg-gray-800 flex items-center justify-center text-gray-700 text-xs">♪</div>}
                </td>
                <td className="px-2 py-2.5 max-w-0 w-full">
                  <p className="text-white font-medium leading-tight truncate">{r.title}</p>
                  <p className="text-gray-500 text-xs truncate">{r.artist}</p>
                </td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  <span className={`${scoreColor} font-semibold tabular-nums text-xs`}>{fmtScore(r.total_score)}</span>
                </td>
                <td className="px-3 py-2.5 text-right hidden sm:table-cell">
                  <span className="text-gray-400 tabular-nums text-xs">{r.weeks_in_chart}</span>
                </td>
                <td className="px-3 py-2.5 text-right hidden sm:table-cell">
                  <span className={`tabular-nums text-xs font-medium ${Number(r.best_position) <= 10 ? "text-green-400" : "text-gray-400"}`}>
                    #{r.best_position}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function exportToExcel(rows, selectedMonth, checkedWeeks) {
  const weeksSorted = [...checkedWeeks].sort();
  const monthLabel = selectedMonth
    ? `${MONTH_NAMES[selectedMonth.month - 1]} ${selectedMonth.year}`
    : "Ranking";

  const BORDER = {
    top:    { style: "thin", color: { rgb: "B0B0B0" } },
    bottom: { style: "thin", color: { rgb: "B0B0B0" } },
    left:   { style: "thin", color: { rgb: "B0B0B0" } },
    right:  { style: "thin", color: { rgb: "B0B0B0" } },
  };

  const hdrStyle = {
    font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
    fill: { fgColor: { rgb: "1F4E79" } },
    alignment: { horizontal: "center", vertical: "center" },
    border: BORDER,
  };

  const cellStyle = (isEven, isText) => ({
    fill: { fgColor: { rgb: isEven ? "D9E1F2" : "FFFFFF" } },
    font: { sz: 11 },
    alignment: { horizontal: isText ? "left" : "center", vertical: "center" },
    border: BORDER,
  });

  const headers = ["#", "Canción", "Artista", "Puntos totales", "Semanas en chart", "Mejor posición", "Pos. promedio"];

  const dataRows = rows.map((r, idx) => [
    idx + 1,
    r.title,
    r.artist,
    Number(r.total_score),
    Number(r.weeks_in_chart),
    Number(r.best_position),
    Number(r.avg_position),
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);

  ws["!cols"] = [{ wch: 5 }, { wch: 42 }, { wch: 30 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 14 }];

  headers.forEach((_, ci) => {
    const ref = XLSX.utils.encode_cell({ r: 0, c: ci });
    if (ws[ref]) ws[ref].s = hdrStyle;
  });

  dataRows.forEach((_, ri) => {
    headers.forEach((__, ci) => {
      const ref = XLSX.utils.encode_cell({ r: ri + 1, c: ci });
      if (!ws[ref]) return;
      ws[ref].s = cellStyle(ri % 2 === 0, ci === 1 || ci === 2);
    });
  });

  // Info sheet
  const infoData = [
    ["Campo",         "Valor"],
    ["Período",       monthLabel],
    ["Semanas",       weeksSorted.join(", ")],
    ["Total canciones", rows.length],
    ["Generado",      new Date().toLocaleDateString("es-CO")],
    [],
    ["Método de clasificación: Puntos por Posición"],
    [],
    ["Descripción"],
    [
      "Cada semana, la canción en el puesto #1 recibe 100 puntos, la del #2 recibe 99, " +
      "la del #3 recibe 98... y así hasta el #100 que recibe 1 punto. " +
      "Al finalizar el período se suman todos los puntos acumulados semana a semana " +
      "y se ordena de mayor a menor.",
    ],
    [],
    ["Fórmula por semana"],
    ["Puntos = 101 − posición"],
    [],
    ["Ejemplo"],
    ["Una canción que estuvo #1 dos semanas y #3 otras dos semanas acumula:"],
    ["100 + 100 + 98 + 98 = 396 puntos en el período."],
  ];

  const wsMeta = XLSX.utils.aoa_to_sheet(infoData);
  wsMeta["!cols"] = [{ wch: 28 }, { wch: 80 }];

  // Style info headers
  ["A1", "B1"].forEach((ref) => {
    if (wsMeta[ref]) wsMeta[ref].s = { ...hdrStyle, fill: { fgColor: { rgb: "374151" } } };
  });
  ["A7", "A9", "A12", "A15"].forEach((ref) => {
    if (wsMeta[ref]) wsMeta[ref].s = { font: { bold: true, sz: 11 } };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Top Mensual");
  XLSX.utils.book_append_sheet(wb, wsMeta, "Info");

  XLSX.writeFile(wb, `Top_Mensual_${monthLabel.replace(" ", "_")}.xlsx`);
}

function TopMensualTab() {
  const [months, setMonths] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [checkedWeeks, setCheckedWeeks] = useState(new Set());
  const [rowsPoints, setRowsPoints] = useState([]);
  const [loadingPoints, setLoadingPoints] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    API("/api/admin/monthly-ranking/months")
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setMonths(list);
        if (list.length > 0) selectMonth(list[0]);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const selectMonth = (m) => {
    setSelectedMonth(m);
    const all = new Set(m.weeks.map((w) => String(w).slice(0, 10)));
    setCheckedWeeks(all);
    fetchBoth(all);
  };

  const fetchBoth = (weekSet) => {
    if (weekSet.size === 0) { setRowsPoints([]); return; }
    const param = encodeURIComponent([...weekSet].join(","));
    fetchMethod(param, "points", setRowsPoints, setLoadingPoints);
  };

  const fetchMethod = async (param, method, setRows, setLoading) => {
    setLoading(true);
    const res = await API(`/api/admin/monthly-ranking?weeks=${param}&method=${method}`);
    const data = await res.json();
    setRows(Array.isArray(data.rows) ? data.rows : []);
    setLoading(false);
  };

  const toggleWeek = (week) => {
    setCheckedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(week)) next.delete(week); else next.add(week);
      fetchBoth(next);
      return next;
    });
  };

  const toggleAll = () => {
    if (!selectedMonth) return;
    const allWeeks = selectedMonth.weeks.map((w) => String(w).slice(0, 10));
    const allChecked = allWeeks.every((w) => checkedWeeks.has(w));
    const next = allChecked ? new Set() : new Set(allWeeks);
    setCheckedWeeks(next);
    fetchBoth(next);
  };

  const fmtWeekLabel = (dateStr) => {
    const d = new Date(dateStr + "T00:00:00Z");
    return d.toLocaleDateString("es-CO", { day: "numeric", month: "short", timeZone: "UTC" });
  };

  const allWeeks = selectedMonth?.weeks?.map((w) => String(w).slice(0, 10)) ?? [];
  const allChecked = allWeeks.length > 0 && allWeeks.every((w) => checkedWeeks.has(w));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold">Top 100 Mensual</h2>
        <p className="text-gray-500 text-sm mt-1">
          Dos métodos de clasificación para las semanas seleccionadas.
        </p>
      </div>

      {/* Selector de mes */}
      <div className="flex items-center gap-2 flex-wrap">
        {!loaded && <p className="text-gray-500 text-sm">Cargando meses...</p>}
        {loaded && months.length === 0 && (
          <p className="text-gray-600 text-sm">No hay datos registrados aún.</p>
        )}
        {months.map((m) => {
          const isActive = selectedMonth?.year === m.year && selectedMonth?.month === m.month;
          return (
            <button
              key={`${m.year}-${m.month}`}
              onClick={() => selectMonth(m)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors border ${
                isActive
                  ? "bg-green-500 border-green-500 text-gray-950"
                  : "bg-transparent border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white"
              }`}
            >
              {MONTH_NAMES[m.month - 1]} {m.year}
            </button>
          );
        })}
      </div>

      {/* Checkboxes de semanas */}
      {selectedMonth && allWeeks.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl px-5 py-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">
              Semanas incluidas
            </span>
            <button onClick={toggleAll} className="text-xs text-gray-400 hover:text-white transition-colors">
              {allChecked ? "Deseleccionar todas" : "Seleccionar todas"}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {allWeeks.map((week) => {
              const checked = checkedWeeks.has(week);
              return (
                <button
                  key={week}
                  onClick={() => toggleWeek(week)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                    checked
                      ? "bg-green-500/15 border-green-500/40 text-green-400"
                      : "bg-gray-800 border-gray-700 text-gray-600 hover:border-gray-600"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${checked ? "bg-green-400" : "bg-gray-600"}`} />
                  {fmtWeekLabel(week)}
                  <span className="text-gray-600 font-normal">{week}</span>
                </button>
              );
            })}
          </div>
          {checkedWeeks.size === 0 && (
            <p className="text-yellow-500/70 text-xs">Seleccioná al menos una semana.</p>
          )}
        </div>
      )}

      {/* Puntos por posición */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="w-2 h-2 rounded-full bg-purple-400 flex-shrink-0" />
          <h3 className="text-base font-semibold text-white">Puntos por Posición</h3>
          <span className="text-xs text-gray-600">#1=100 · #2=99 · … · #100=1 pt por semana</span>
          {loadingPoints
            ? <span className="text-xs text-gray-600 ml-auto">Calculando...</span>
            : rowsPoints.length > 0 && (
              <>
                <span className="text-xs text-gray-600 ml-auto">{rowsPoints.length} canciones</span>
                <button
                  onClick={() => exportToExcel(rowsPoints, selectedMonth, checkedWeeks)}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white transition-colors"
                >
                  Exportar Excel
                </button>
              </>
            )
          }
        </div>
        {loadingPoints
          ? <p className="text-gray-500 text-sm">Calculando ranking...</p>
          : <RankingTable rows={rowsPoints} loaded={loaded} checkedWeeks={checkedWeeks} scoreLabel="Puntos totales" scoreColor="text-purple-400" />
        }
      </div>
    </div>
  );
}

// ── Songs ─────────────────────────────────────────────────────────────────────

function SongsTab() {
  const [songs, setSongs] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editValues, setEditValues] = useState({});

  const fetchSongs = useCallback(async () => {
    setLoading(true);
    const res = await API(`/api/admin/songs${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    const data = await res.json();
    setSongs(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [q]);

  useEffect(() => {
    const t = setTimeout(fetchSongs, 300);
    return () => clearTimeout(t);
  }, [fetchSongs]);

  const handleEdit = (song) => {
    setEditing(song.song_id);
    setEditValues({ title: song.title, artist: song.artist, genre: song.genre ?? "" });
  };

  const handleSave = async (song_id) => {
    await API(`/api/admin/songs/${encodeURIComponent(song_id)}`, {
      method: "PUT",
      body: JSON.stringify(editValues),
    });
    setEditing(null);
    fetchSongs();
  };

  const handleDelete = async (song_id) => {
    if (!confirm("¿Eliminar esta canción?")) return;
    await API(`/api/admin/songs/${encodeURIComponent(song_id)}`, { method: "DELETE" });
    fetchSongs();
  };

  const fmtDate = (d) =>
    d ? new Date(d).toLocaleDateString("es-CO", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : "—";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Songs</h2>
        <span className="text-sm text-gray-500">{songs.length} resultados</span>
      </div>
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por título o artista…"
        className="w-full max-w-sm bg-gray-900 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-green-500"
      />

      {loading ? (
        <p className="text-gray-500 text-sm">Cargando...</p>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 text-xs">
                <th className="text-left px-4 py-3 w-10"></th>
                <th className="text-left px-4 py-3">Canción</th>
                <th className="text-left px-4 py-3">Género</th>
                <th className="text-left px-4 py-3">Spotify</th>
                <th className="text-left px-4 py-3">Debut</th>
                <th className="text-left px-4 py-3">Peak</th>
                <th className="text-right px-4 py-3">Semanas</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {songs.map((s) => (
                <tr key={s.song_id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/50">
                  {editing === s.song_id ? (
                    <>
                      {/* cover placeholder in edit mode */}
                      <td className="px-4 py-2">
                        {s.cover_url
                          ? <img src={s.cover_url} alt="" className="w-8 h-8 rounded object-cover opacity-50" />
                          : <div className="w-8 h-8 rounded bg-gray-800" />}
                      </td>
                      <td className="px-4 py-2" colSpan={1}>
                        <div className="flex flex-col gap-1">
                          <input value={editValues.title} onChange={(e) => setEditValues((v) => ({ ...v, title: e.target.value }))}
                            placeholder="Título"
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-green-500" />
                          <input value={editValues.artist} onChange={(e) => setEditValues((v) => ({ ...v, artist: e.target.value }))}
                            placeholder="Artista"
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-gray-400 text-xs focus:outline-none focus:border-green-500" />
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <input value={editValues.genre} onChange={(e) => setEditValues((v) => ({ ...v, genre: e.target.value }))}
                          placeholder="Género"
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-green-500" />
                      </td>
                      <td className="px-4 py-2 text-gray-600 text-xs" colSpan={4}>
                        <span className="font-mono">{s.song_id}</span>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => handleSave(s.song_id)} className="text-xs text-green-400 hover:text-green-300 font-medium">Guardar</button>
                          <button onClick={() => setEditing(null)} className="text-xs text-gray-500 hover:text-gray-300">Cancelar</button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3">
                        {s.cover_url
                          ? <img src={s.cover_url} alt="" className="w-8 h-8 rounded object-cover" />
                          : <div className="w-8 h-8 rounded bg-gray-800 flex items-center justify-center text-gray-700 text-xs">♪</div>}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-white font-medium leading-tight">{s.title}</p>
                        <p className="text-gray-500 text-xs mt-0.5">{s.artist}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{s.genre ?? "—"}</td>
                      <td className="px-4 py-3">
                        {s.spotify_url ? (
                          <a href={s.spotify_url} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-green-400 hover:text-green-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                            {s.spotify_title ?? "Sí"}
                          </a>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-700 inline-block" />
                            Sin caché
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(s.debut_chart_date)}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(s.peak_chart_date)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-xs font-medium tabular-nums ${parseInt(s.week_count) > 0 ? "text-white" : "text-gray-600"}`}>
                          {s.week_count ?? 0}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-3 justify-end">
                          <button onClick={() => handleEdit(s)} className="text-xs text-gray-400 hover:text-white">Editar</button>
                          <button onClick={() => handleDelete(s.song_id)} className="text-xs text-red-500 hover:text-red-400">Eliminar</button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {songs.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-600 text-sm">Sin resultados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Weekly Tops ───────────────────────────────────────────────────────────────

function WeeklyTopsTab() {
  const [weeks, setWeeks] = useState([]);
  const [weekIdx, setWeekIdx] = useState(0);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [weeksLoaded, setWeeksLoaded] = useState(false);

  useEffect(() => {
    API("/api/admin/weekly-tops")
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data.map((d) => d.week_start) : [];
        setWeeks(list);
        setWeeksLoaded(true);
        if (list.length > 0) loadWeek(list[0], list);
      });
  }, []);

  const loadWeek = async (week, list = weeks) => {
    setLoading(true);
    const res = await API(`/api/admin/weekly-tops?week=${week}`);
    const data = await res.json();
    setRows(Array.isArray(data) ? data : []);
    setWeekIdx(list.indexOf(week));
    setLoading(false);
  };

  const selectedWeek = weeks[weekIdx] ?? null;

  const handleDelete = async (id) => {
    if (!confirm("¿Eliminar esta entrada?")) return;
    await API(`/api/admin/weekly-tops/${id}`, { method: "DELETE" });
    loadWeek(selectedWeek);
  };

  const handleDeleteWeek = async () => {
    if (!selectedWeek) return;
    const label = fmtDate(selectedWeek);
    if (!confirm(`¿Eliminar TODA la semana ${label} (${rows.length} entradas)? Esta acción no se puede deshacer.`)) return;
    const res = await API(`/api/admin/weekly-tops/week/${selectedWeek}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) { alert("Error: " + (data.error ?? res.status)); return; }
    const newWeeks = weeks.filter((w) => w !== selectedWeek);
    setWeeks(newWeeks);
    if (newWeeks.length > 0) {
      const nextIdx = Math.min(weekIdx, newWeeks.length - 1);
      loadWeek(newWeeks[nextIdx], newWeeks);
    } else {
      setRows([]);
      setWeekIdx(0);
    }
  };

  const fmtDate = (d) =>
    d ? new Date(d).toLocaleDateString("es-CO", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : "—";

  const fmtNum = (n) => (n != null ? Number(n).toLocaleString("es-CO") : "—");

  return (
    <div className="flex flex-col gap-4">
      {/* Header + navegación */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Weekly Tops</h2>
        {selectedWeek && (
          <span className="text-sm text-gray-500">{rows.length} entradas</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => weekIdx + 1 < weeks.length && loadWeek(weeks[weekIdx + 1])}
          disabled={weekIdx + 1 >= weeks.length}
          className="px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 disabled:opacity-30 disabled:cursor-not-allowed text-sm transition-colors"
        >
          ← Anterior
        </button>

        <select
          value={selectedWeek ?? ""}
          onChange={(e) => e.target.value && loadWeek(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-green-500"
        >
          {!weeksLoaded && <option value="">Cargando…</option>}
          {weeks.map((w) => (
            <option key={w} value={w}>
              {fmtDate(w)} — {w}
            </option>
          ))}
        </select>

        <button
          onClick={() => weekIdx - 1 >= 0 && loadWeek(weeks[weekIdx - 1])}
          disabled={weekIdx - 1 < 0}
          className="px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 disabled:opacity-30 disabled:cursor-not-allowed text-sm transition-colors"
        >
          Siguiente →
        </button>

        {selectedWeek && (
          <span className="ml-2 text-xs text-gray-600">
            semana {weeks.length - weekIdx} de {weeks.length}
          </span>
        )}

        {selectedWeek && (
          <button
            onClick={handleDeleteWeek}
            className="ml-auto text-xs text-red-400 hover:text-red-300 border border-red-900 hover:border-red-700 rounded-lg px-3 py-1.5 transition-colors"
          >
            Eliminar semana completa
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Cargando...</p>
      ) : selectedWeek ? (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 text-xs">
                <th className="text-left px-4 py-3 w-10">#</th>
                <th className="text-left px-4 py-3 w-10"></th>
                <th className="text-left px-4 py-3">Canción</th>
                <th className="text-right px-4 py-3">Tot w/ Radio</th>
                <th className="text-right px-4 py-3">Radio Impact</th>
                <th className="text-right px-4 py-3">Consumption</th>
                <th className="text-right px-4 py-3">Radio %</th>
                <th className="text-left px-4 py-3">ISRC</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/50">
                  <td className="px-4 py-3">
                    <span className={`font-bold tabular-nums text-sm ${r.position <= 10 ? "text-green-400" : r.position <= 40 ? "text-white" : "text-gray-500"}`}>
                      {r.position}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {r.cover_url
                      ? <img src={r.cover_url} alt="" className="w-8 h-8 rounded object-cover" />
                      : <div className="w-8 h-8 rounded bg-gray-800 flex items-center justify-center text-gray-700 text-xs">♪</div>}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-white font-medium leading-tight">{r.title ?? "—"}</p>
                    <p className="text-gray-500 text-xs mt-0.5">{r.artist ?? "—"}</p>
                  </td>
                  <td className="px-4 py-3 text-right text-white tabular-nums font-medium">{fmtNum(r.tot_with_radio)}</td>
                  <td className="px-4 py-3 text-right text-gray-400 tabular-nums">{fmtNum(r.radio_impact)}</td>
                  <td className="px-4 py-3 text-right text-gray-400 tabular-nums">{fmtNum(r.consumption)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {r.radio_pct != null ? (
                      <span className={`text-xs font-medium ${Number(r.radio_pct) >= 50 ? "text-green-400" : "text-gray-400"}`}>
                        {Number(r.radio_pct).toFixed(1)}%
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs font-mono">{r.isrc ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleDelete(r.id)} className="text-xs text-red-500 hover:text-red-400">Eliminar</button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-600">Sin entradas para esta semana</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center text-gray-600 text-sm">
          {weeksLoaded ? "No hay semanas registradas aún" : "Cargando semanas…"}
        </div>
      )}
    </div>
  );
}

// ── Song Map ──────────────────────────────────────────────────────────────────

function SongMapTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [q, setQ] = useState("");

  const fetchRows = async () => {
    setLoading(true);
    const res = await API("/api/song-map");
    const data = await res.json();
    setRows(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => { fetchRows(); }, []);

  const filtered = q.trim()
    ? rows.filter((r) => {
        const s = q.toLowerCase();
        return (
          r.luminate_title?.toLowerCase().includes(s) ||
          r.luminate_artist?.toLowerCase().includes(s) ||
          r.isrc?.toLowerCase().includes(s) ||
          r.codigo?.toLowerCase().includes(s)
        );
      })
    : rows;

  const handleEdit = (row) => {
    setEditing(row.id);
    setEditValues({ luminate_title: row.luminate_title, luminate_artist: row.luminate_artist, isrc: row.isrc ?? "", codigo: row.codigo ?? "" });
  };

  const handleSave = async (id) => {
    await API(`/api/admin/song-map/${id}`, { method: "PUT", body: JSON.stringify(editValues) });
    setEditing(null);
    fetchRows();
  };

  const handleDelete = async (id) => {
    if (!confirm("¿Eliminar este mapeo?")) return;
    await API(`/api/admin/song-map/${id}`, { method: "DELETE" });
    fetchRows();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Song Map</h2>
        <span className="text-sm text-gray-500">
          {q ? `${filtered.length} de ${rows.length}` : `${rows.length}`} mapeos
        </span>
      </div>

      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Filtrar por título, artista, ISRC o código…"
        className="w-full max-w-sm bg-gray-900 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-green-500"
      />

      {loading ? (
        <p className="text-gray-500 text-sm">Cargando...</p>
      ) : rows.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center text-gray-600 text-sm">
          Sin mapeos guardados aún
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 text-xs">
                <th className="text-left px-4 py-3">Luminate Title</th>
                <th className="text-left px-4 py-3">Luminate Artist</th>
                <th className="text-left px-4 py-3">ISRC</th>
                <th className="text-left px-4 py-3">Código</th>
                <th className="text-left px-4 py-3">Confirmado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/50">
                  {editing === r.id ? (
                    <>
                      <td className="px-4 py-2"><input value={editValues.luminate_title} onChange={(e) => setEditValues((v) => ({ ...v, luminate_title: e.target.value }))} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-green-500" /></td>
                      <td className="px-4 py-2"><input value={editValues.luminate_artist} onChange={(e) => setEditValues((v) => ({ ...v, luminate_artist: e.target.value }))} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-green-500" /></td>
                      <td className="px-4 py-2"><input value={editValues.isrc} onChange={(e) => setEditValues((v) => ({ ...v, isrc: e.target.value }))} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-green-500" /></td>
                      <td className="px-4 py-2"><input value={editValues.codigo} onChange={(e) => setEditValues((v) => ({ ...v, codigo: e.target.value }))} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-green-500" /></td>
                      <td className="px-4 py-2 text-gray-600 text-xs">{r.confirmed_at ? new Date(r.confirmed_at).toLocaleDateString() : "—"}</td>
                      <td className="px-4 py-2">
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => handleSave(r.id)} className="text-xs text-green-400 hover:text-green-300 font-medium">Guardar</button>
                          <button onClick={() => setEditing(null)} className="text-xs text-gray-500 hover:text-gray-300">Cancelar</button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 text-white">{r.luminate_title}</td>
                      <td className="px-4 py-3 text-gray-400">{r.luminate_artist}</td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{r.isrc ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{r.codigo ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{r.confirmed_at ? new Date(r.confirmed_at).toLocaleDateString() : "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-3 justify-end">
                          <button onClick={() => handleEdit(r)} className="text-xs text-gray-400 hover:text-white">Editar</button>
                          <button onClick={() => handleDelete(r.id)} className="text-xs text-red-500 hover:text-red-400">Eliminar</button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-600 text-sm">Sin resultados para "{q}"</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Spotify Cache ─────────────────────────────────────────────────────────────

function SpotifyCacheTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const fetchRows = async () => {
    setLoading(true);
    const res = await API("/api/spotify-names");
    const data = await res.json();
    setRows(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => { fetchRows(); }, []);

  const filtered = q.trim()
    ? rows.filter((r) => {
        const s = q.toLowerCase();
        return (
          r.luminate_title?.toLowerCase().includes(s) ||
          r.luminate_artist?.toLowerCase().includes(s) ||
          r.spotify_title?.toLowerCase().includes(s) ||
          r.spotify_artist?.toLowerCase().includes(s)
        );
      })
    : rows;

  const handleDelete = async (row) => {
    if (!confirm("¿Eliminar esta entrada del caché?")) return;
    await API("/api/admin/spotify-names", {
      method: "DELETE",
      body: JSON.stringify({ song_id: row.song_id }),
    });
    fetchRows();
  };

  const handleClearAll = async () => {
    if (!confirm("¿Limpiar TODO el caché de Spotify? Esto hará que se vuelvan a buscar todas las canciones.")) return;
    await API("/api/admin/spotify-names/all", { method: "DELETE" });
    fetchRows();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Spotify Cache</h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">
            {q ? `${filtered.length} de ${rows.length}` : rows.length} entradas
          </span>
          {rows.length > 0 && (
            <button onClick={handleClearAll} className="text-xs text-red-400 hover:text-red-300 border border-red-900 rounded-lg px-3 py-1.5 transition-colors">
              Limpiar todo
            </button>
          )}
        </div>
      </div>

      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Filtrar por título o artista…"
        className="w-full max-w-sm bg-gray-900 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-green-500"
      />

      {loading ? (
        <p className="text-gray-500 text-sm">Cargando...</p>
      ) : rows.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center text-gray-600 text-sm">
          Caché vacío
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 text-xs">
                <th className="text-left px-4 py-3 w-10"></th>
                <th className="text-left px-4 py-3">Luminate</th>
                <th className="text-left px-4 py-3">Spotify</th>
                <th className="text-left px-4 py-3">Link</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={i} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/50">
                  <td className="px-4 py-3">
                    {r.cover_url
                      ? <img src={r.cover_url} alt="" className="w-8 h-8 rounded object-cover" />
                      : <div className="w-8 h-8 rounded bg-gray-800 flex items-center justify-center text-gray-700 text-xs">♪</div>}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-white">{r.luminate_title}</p>
                    <p className="text-gray-500 text-xs">{r.luminate_artist}</p>
                  </td>
                  <td className="px-4 py-3">
                    {r.spotify_title ? (
                      <>
                        <p className="text-green-400">{r.spotify_title}</p>
                        <p className="text-gray-500 text-xs">{r.spotify_artist}</p>
                      </>
                    ) : (
                      <span className="text-gray-600 text-xs">No encontrado</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.spotify_url ? (
                      <a href={r.spotify_url} target="_blank" rel="noreferrer"
                        className="text-xs text-green-500 hover:text-green-400 underline underline-offset-2">
                        Abrir ↗
                      </a>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleDelete(r)} className="text-xs text-red-500 hover:text-red-400">Eliminar</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-600 text-sm">Sin resultados para "{q}"</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
