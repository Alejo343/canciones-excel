const express = require('express');
const cors = require('cors');
const pool = require('./db');
const { searchTrack } = require('./spotify');

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

const PORT = 3001;
app.listen(PORT, () => console.log(`API corriendo en http://localhost:${PORT}`));
