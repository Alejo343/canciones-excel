import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";

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

const TABS = ["Songs", "Weekly Tops", "Song Map", "Spotify Cache"];

export default function Admin() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("Songs");

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
      <main className="max-w-6xl mx-auto px-8 py-8">
        {tab === "Songs" && <SongsTab />}
        {tab === "Weekly Tops" && <WeeklyTopsTab />}
        {tab === "Song Map" && <SongMapTab />}
        {tab === "Spotify Cache" && <SpotifyCacheTab />}
      </main>
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
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 text-xs">
                <th className="text-left px-4 py-3">ID</th>
                <th className="text-left px-4 py-3">Título</th>
                <th className="text-left px-4 py-3">Artista</th>
                <th className="text-left px-4 py-3">Género</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {songs.map((s) => (
                <tr key={s.song_id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/50">
                  {editing === s.song_id ? (
                    <>
                      <td className="px-4 py-2 text-gray-500 text-xs">{s.song_id}</td>
                      <td className="px-4 py-2">
                        <input value={editValues.title} onChange={(e) => setEditValues((v) => ({ ...v, title: e.target.value }))}
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-green-500" />
                      </td>
                      <td className="px-4 py-2">
                        <input value={editValues.artist} onChange={(e) => setEditValues((v) => ({ ...v, artist: e.target.value }))}
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-green-500" />
                      </td>
                      <td className="px-4 py-2">
                        <input value={editValues.genre} onChange={(e) => setEditValues((v) => ({ ...v, genre: e.target.value }))}
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-green-500" />
                      </td>
                      <td className="px-4 py-2 flex gap-2 justify-end">
                        <button onClick={() => handleSave(s.song_id)} className="text-xs text-green-400 hover:text-green-300 font-medium">Guardar</button>
                        <button onClick={() => setEditing(null)} className="text-xs text-gray-500 hover:text-gray-300">Cancelar</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 text-gray-500 text-xs font-mono">{s.song_id}</td>
                      <td className="px-4 py-3 text-white">{s.title}</td>
                      <td className="px-4 py-3 text-gray-400">{s.artist}</td>
                      <td className="px-4 py-3 text-gray-500">{s.genre ?? "—"}</td>
                      <td className="px-4 py-3 flex gap-3 justify-end">
                        <button onClick={() => handleEdit(s)} className="text-xs text-gray-400 hover:text-white">Editar</button>
                        <button onClick={() => handleDelete(s.song_id)} className="text-xs text-red-500 hover:text-red-400">Eliminar</button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {songs.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-600 text-sm">Sin resultados</td></tr>
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
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    API("/api/admin/weekly-tops")
      .then((r) => r.json())
      .then((data) => {
        setWeeks(Array.isArray(data) ? data.map((d) => d.week_start) : []);
      });
  }, []);

  const loadWeek = async (week) => {
    setSelectedWeek(week);
    setLoading(true);
    const res = await API(`/api/admin/weekly-tops?week=${week}`);
    const data = await res.json();
    setRows(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  const handleDelete = async (id) => {
    if (!confirm("¿Eliminar esta entrada?")) return;
    await API(`/api/admin/weekly-tops/${id}`, { method: "DELETE" });
    loadWeek(selectedWeek);
  };

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-bold">Weekly Tops</h2>

      <div className="flex items-center gap-3">
        <label className="text-sm text-gray-400">Semana:</label>
        <select
          value={selectedWeek ?? ""}
          onChange={(e) => e.target.value && loadWeek(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-green-500"
        >
          <option value="">Seleccionar semana…</option>
          {weeks.map((w) => (
            <option key={w} value={w}>{w}</option>
          ))}
        </select>
        {selectedWeek && (
          <span className="text-sm text-gray-500">{rows.length} entradas</span>
        )}
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Cargando...</p>
      ) : selectedWeek && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 text-xs">
                <th className="text-left px-4 py-3">#</th>
                <th className="text-left px-4 py-3">Título</th>
                <th className="text-left px-4 py-3">Artista</th>
                <th className="text-left px-4 py-3">Género</th>
                <th className="text-left px-4 py-3">Song ID</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/50">
                  <td className="px-4 py-3 text-green-400 font-bold">{r.position}</td>
                  <td className="px-4 py-3 text-white">{r.title ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-400">{r.artist ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-500">{r.genre ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs font-mono">{r.song_id}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleDelete(r.id)} className="text-xs text-red-500 hover:text-red-400">Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

  const fetchRows = async () => {
    setLoading(true);
    const res = await API("/api/song-map");
    const data = await res.json();
    setRows(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => { fetchRows(); }, []);

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
        <span className="text-sm text-gray-500">{rows.length} mapeos</span>
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Cargando...</p>
      ) : rows.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center text-gray-600 text-sm">
          Sin mapeos guardados aún
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
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
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/50">
                  {editing === r.id ? (
                    <>
                      <td className="px-4 py-2"><input value={editValues.luminate_title} onChange={(e) => setEditValues((v) => ({ ...v, luminate_title: e.target.value }))} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-green-500" /></td>
                      <td className="px-4 py-2"><input value={editValues.luminate_artist} onChange={(e) => setEditValues((v) => ({ ...v, luminate_artist: e.target.value }))} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-green-500" /></td>
                      <td className="px-4 py-2"><input value={editValues.isrc} onChange={(e) => setEditValues((v) => ({ ...v, isrc: e.target.value }))} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-green-500" /></td>
                      <td className="px-4 py-2"><input value={editValues.codigo} onChange={(e) => setEditValues((v) => ({ ...v, codigo: e.target.value }))} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-green-500" /></td>
                      <td className="px-4 py-2 text-gray-600 text-xs">{r.confirmed_at ? new Date(r.confirmed_at).toLocaleDateString() : "—"}</td>
                      <td className="px-4 py-2 flex gap-2 justify-end">
                        <button onClick={() => handleSave(r.id)} className="text-xs text-green-400 hover:text-green-300 font-medium">Guardar</button>
                        <button onClick={() => setEditing(null)} className="text-xs text-gray-500 hover:text-gray-300">Cancelar</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 text-white">{r.luminate_title}</td>
                      <td className="px-4 py-3 text-gray-400">{r.luminate_artist}</td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{r.isrc ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{r.codigo ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{r.confirmed_at ? new Date(r.confirmed_at).toLocaleDateString() : "—"}</td>
                      <td className="px-4 py-3 flex gap-3 justify-end">
                        <button onClick={() => handleEdit(r)} className="text-xs text-gray-400 hover:text-white">Editar</button>
                        <button onClick={() => handleDelete(r.id)} className="text-xs text-red-500 hover:text-red-400">Eliminar</button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
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

  const fetchRows = async () => {
    setLoading(true);
    const res = await API("/api/spotify-names");
    const data = await res.json();
    setRows(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => { fetchRows(); }, []);

  const handleDelete = async (row) => {
    if (!confirm("¿Eliminar esta entrada del caché?")) return;
    await API("/api/admin/spotify-names", {
      method: "DELETE",
      body: JSON.stringify({ luminate_title: row.luminate_title, luminate_artist: row.luminate_artist }),
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
          <span className="text-sm text-gray-500">{rows.length} entradas</span>
          {rows.length > 0 && (
            <button onClick={handleClearAll} className="text-xs text-red-400 hover:text-red-300 border border-red-900 rounded-lg px-3 py-1.5 transition-colors">
              Limpiar todo
            </button>
          )}
        </div>
      </div>

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
                <th className="text-left px-4 py-3">Luminate</th>
                <th className="text-left px-4 py-3">Spotify</th>
                <th className="text-left px-4 py-3">Actualizado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/50">
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
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    {r.updated_at ? new Date(r.updated_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleDelete(r)} className="text-xs text-red-500 hover:text-red-400">Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
