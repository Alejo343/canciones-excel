require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('./db');
const { searchTrack } = require('./spotify');

const JWT_SECRET = process.env.JWT_SECRET;

function requireAuth(req, res, next) {
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'No autorizado' });
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}

const app = express();
app.use(cors());
app.use(express.json());

// ── song_map ──────────────────────────────────────────────────────────────────

app.get('/api/song-map', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM song_map ORDER BY confirmed_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/song-map', async (req, res) => {
  const { luminate_title, luminate_artist, isrc, codigo } = req.body;
  if (!luminate_title || !luminate_artist) {
    return res.status(400).json({ error: 'luminate_title y luminate_artist son requeridos' });
  }
  try {
    await pool.query(
      `INSERT INTO song_map (luminate_title, luminate_artist, isrc, codigo, confirmed_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (luminate_title, luminate_artist)
       DO UPDATE SET isrc = $3, codigo = $4, confirmed_at = NOW()`,
      [luminate_title, luminate_artist, isrc ?? null, codigo ?? null],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── spotify_names ─────────────────────────────────────────────────────────────

// Devuelve el caché completo para precarga (evita llamadas Spotify para canciones ya conocidas)
app.get('/api/spotify-names', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM spotify_names');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// SSE: recibe [{title, artist}] x100, devuelve resultados uno a uno
app.post('/api/spotify-search', async (req, res) => {
  const { songs } = req.body; // [{ title, artist }]
  if (!Array.isArray(songs) || songs.length === 0) {
    return res.status(400).json({ error: 'songs[] es requerido' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  // Precargar caché de spotify_names para este lote
  const titles = songs.map((s) => s.title);
  const artists = songs.map((s) => s.artist);

  const cached = await pool.query(
    `SELECT luminate_title, luminate_artist, spotify_title, spotify_artist, spotify_url, cover_url
     FROM spotify_names
     WHERE (luminate_title, luminate_artist) = ANY(
       SELECT UNNEST($1::text[]), UNNEST($2::text[])
     )`,
    [titles, artists],
  ).catch(() => ({ rows: [] }));

  const cacheMap = new Map();
  for (const row of cached.rows) {
    cacheMap.set(`${row.luminate_title}|||${row.luminate_artist}`, row);
  }

  for (let i = 0; i < songs.length; i++) {
    const { title, artist } = songs[i];
    const cacheKey = `${title}|||${artist}`;

    send({ type: 'progress', index: i + 1, total: songs.length, song: `${title} - ${artist}` });

    const hit = cacheMap.get(cacheKey);
    if (hit) {
      send({
        type: 'result',
        index: i + 1,
        cached: true,
        entry: {
          rank: i + 1,
          luminate_title: title,
          luminate_artist: artist,
          spotify_title: hit.spotify_title,
          spotify_artist: hit.spotify_artist,
          spotify_url: hit.spotify_url,
          cover_url: hit.cover_url,
        },
      });
      continue;
    }

    // No está en caché → llamar Spotify
    let spotifyResult = null;
    try {
      spotifyResult = await searchTrack(title, artist);
    } catch (e) {
      console.error(`[Spotify] Error para "${title}":`, e.message);
    }

    const entry = {
      rank: i + 1,
      luminate_title: title,
      luminate_artist: artist,
      spotify_title: spotifyResult?.song ?? null,
      spotify_artist: spotifyResult?.artist ?? null,
      spotify_url: spotifyResult?.spotify ?? null,
      cover_url: spotifyResult?.cover ?? null,
    };

    // Guardar en caché
    await pool.query(
      `INSERT INTO spotify_names (luminate_title, luminate_artist, spotify_title, spotify_artist, spotify_url, cover_url, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (luminate_title, luminate_artist)
       DO UPDATE SET spotify_title=$3, spotify_artist=$4, spotify_url=$5, cover_url=$6, updated_at=NOW()`,
      [title, artist, entry.spotify_title, entry.spotify_artist, entry.spotify_url, entry.cover_url],
    ).catch((e) => console.error('[DB] Error guardando spotify_names:', e.message));

    send({ type: 'result', index: i + 1, cached: false, entry });
  }

  send({ type: 'done', total: songs.length });
  res.end();
});

// ── auth ──────────────────────────────────────────────────────────────────────

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (username !== process.env.ADMIN_USER) {
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }
  const valid = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);
  if (!valid) return res.status(401).json({ error: 'Credenciales incorrectas' });
  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token });
});

// ── admin: song_map ───────────────────────────────────────────────────────────

app.delete('/api/admin/song-map/:id', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM song_map WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/song-map/:id', requireAuth, async (req, res) => {
  const { luminate_title, luminate_artist, isrc, codigo } = req.body;
  try {
    await pool.query(
      'UPDATE song_map SET luminate_title=$1, luminate_artist=$2, isrc=$3, codigo=$4 WHERE id=$5',
      [luminate_title, luminate_artist, isrc ?? null, codigo ?? null, req.params.id],
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── admin: songs ──────────────────────────────────────────────────────────────

app.get('/api/admin/songs', requireAuth, async (req, res) => {
  const { q } = req.query;
  try {
    let result;
    if (q) {
      result = await pool.query(
        `SELECT * FROM songs WHERE title ILIKE $1 OR artist ILIKE $1 ORDER BY title LIMIT 100`,
        [`%${q}%`],
      );
    } else {
      result = await pool.query('SELECT * FROM songs ORDER BY title LIMIT 100');
    }
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/songs', requireAuth, async (req, res) => {
  const { song_id, title, artist, genre } = req.body;
  try {
    await pool.query(
      'INSERT INTO songs (song_id, title, artist, genre) VALUES ($1, $2, $3, $4)',
      [song_id, title, artist, genre ?? null],
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/songs/:song_id', requireAuth, async (req, res) => {
  const { title, artist, genre } = req.body;
  try {
    await pool.query(
      'UPDATE songs SET title=$1, artist=$2, genre=$3 WHERE song_id=$4',
      [title, artist, genre ?? null, req.params.song_id],
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/songs/:song_id', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM songs WHERE song_id = $1', [req.params.song_id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── admin: weekly_tops ────────────────────────────────────────────────────────

app.get('/api/admin/weekly-tops', requireAuth, async (req, res) => {
  const { week } = req.query;
  try {
    let result;
    if (week) {
      result = await pool.query(
        `SELECT wt.*, s.title, s.artist, s.genre
         FROM weekly_tops wt LEFT JOIN songs s ON wt.song_id = s.song_id
         WHERE wt.week_start = $1 ORDER BY wt.position`,
        [week],
      );
    } else {
      result = await pool.query(
        `SELECT DISTINCT week_start FROM weekly_tops ORDER BY week_start DESC LIMIT 52`,
      );
    }
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/weekly-tops/:id', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM weekly_tops WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── admin: spotify_names ──────────────────────────────────────────────────────

app.delete('/api/admin/spotify-names', requireAuth, async (req, res) => {
  const { luminate_title, luminate_artist } = req.body;
  try {
    await pool.query(
      'DELETE FROM spotify_names WHERE luminate_title=$1 AND luminate_artist=$2',
      [luminate_title, luminate_artist],
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/spotify-names/all', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM spotify_names');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = 3005;
app.listen(PORT, () => console.log(`API corriendo en http://localhost:${PORT}`));
