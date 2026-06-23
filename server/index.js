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

// ── spotify search & cache (via songs table) ──────────────────────────────────

app.get('/api/spotify-names', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT song_id, title AS luminate_title, artist AS luminate_artist,
              spotify_title, spotify_artist, spotify_url, cover_url
       FROM songs WHERE spotify_url IS NOT NULL
       ORDER BY title`,
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SSE: recibe [{song_id, title, artist}] x100, devuelve resultados uno a uno
app.post('/api/spotify-search', async (req, res) => {
  const { songs } = req.body;
  if (!Array.isArray(songs) || songs.length === 0) {
    return res.status(400).json({ error: 'songs[] es requerido' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  // Pre-upsert songs so cache lookup by song_id works
  for (const s of songs) {
    if (!s.song_id) continue;
    await pool.query(
      `INSERT INTO songs (song_id, title, artist)
       VALUES ($1, $2, $3)
       ON CONFLICT (song_id) DO UPDATE SET title = EXCLUDED.title, artist = EXCLUDED.artist`,
      [s.song_id, s.title, s.artist],
    ).catch(() => {});
  }

  // Load cache for this batch by song_id
  const songIds = songs.map((s) => s.song_id).filter(Boolean);
  const cached = await pool.query(
    `SELECT song_id, spotify_title, spotify_artist, spotify_url, cover_url
     FROM songs WHERE song_id = ANY($1) AND spotify_url IS NOT NULL`,
    [songIds],
  ).catch(() => ({ rows: [] }));

  const cacheMap = new Map(cached.rows.map((r) => [r.song_id, r]));

  for (let i = 0; i < songs.length; i++) {
    const { song_id, title, artist } = songs[i];

    send({ type: 'progress', index: i + 1, total: songs.length, song: `${title} - ${artist}` });

    const hit = song_id ? cacheMap.get(song_id) : null;
    if (hit) {
      send({
        type: 'result', index: i + 1, cached: true,
        entry: {
          rank: i + 1,
          luminate_title: title, luminate_artist: artist,
          spotify_title: hit.spotify_title, spotify_artist: hit.spotify_artist,
          spotify_url: hit.spotify_url, cover_url: hit.cover_url,
        },
      });
      continue;
    }

    let spotifyResult = null;
    try {
      spotifyResult = await searchTrack(title, artist);
    } catch (e) {
      console.error(`[Spotify] Error para "${title}":`, e.message);
    }

    const entry = {
      rank: i + 1,
      luminate_title: title, luminate_artist: artist,
      spotify_title: spotifyResult?.song ?? null,
      spotify_artist: spotifyResult?.artist ?? null,
      spotify_url: spotifyResult?.spotify ?? null,
      cover_url: spotifyResult?.cover ?? null,
    };

    if (song_id) {
      await pool.query(
        `UPDATE songs SET spotify_title=$1, spotify_artist=$2, spotify_url=$3, cover_url=$4
         WHERE song_id=$5`,
        [entry.spotify_title, entry.spotify_artist, entry.spotify_url, entry.cover_url, song_id],
      ).catch((e) => console.error('[DB] Error guardando spotify en songs:', e.message));
    }

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
    const filter = q ? `AND (s.title ILIKE $1 OR s.artist ILIKE $1)` : '';
    const params = q ? [`%${q}%`] : [];
    const result = await pool.query(
      `SELECT s.*,
              COUNT(wt.week_start) AS week_count
       FROM songs s
       LEFT JOIN weekly_tops wt ON wt.song_id = s.song_id
       WHERE TRUE ${filter}
       GROUP BY s.song_id
       ORDER BY s.title
       LIMIT 100`,
      params,
    );
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

// ── weekly ranking (wizard auto-save) ────────────────────────────────────────

app.post('/api/weekly-ranking', async (req, res) => {
  const { week_date, songs } = req.body;
  if (!week_date || !Array.isArray(songs) || songs.length === 0) {
    return res.status(400).json({ error: 'week_date y songs son requeridos' });
  }
  try {
    for (const s of songs) {
      const song_id = s.luminate_song_id;
      if (!song_id) continue;

      // 1. Upsert into songs catalog
      await pool.query(
        `INSERT INTO songs (song_id, title, artist, debut_chart_date)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (song_id) DO UPDATE SET
           title            = EXCLUDED.title,
           artist           = EXCLUDED.artist,
           debut_chart_date = LEAST(COALESCE(songs.debut_chart_date, EXCLUDED.debut_chart_date), EXCLUDED.debut_chart_date)`,
        [song_id, s.title, s.artist, week_date],
      );

      // 2. ISRC: use provided value or look up from song_map
      let isrc = s.isrc ?? null;
      if (!isrc) {
        const sm = await pool.query(
          `SELECT isrc FROM song_map WHERE lower(luminate_title) = lower($1) AND isrc IS NOT NULL LIMIT 1`,
          [s.title],
        );
        if (sm.rows.length > 0) isrc = sm.rows[0].isrc;
      }

      // 3. Upsert into weekly_tops
      await pool.query(
        `INSERT INTO weekly_tops
           (week_start, position, song_id, isrc, spotify_id,
            tot_with_radio, radio_impact, consumption, radio_pct)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (week_start, song_id) DO UPDATE SET
           position       = EXCLUDED.position,
           isrc           = COALESCE(EXCLUDED.isrc,       weekly_tops.isrc),
           spotify_id     = COALESCE(EXCLUDED.spotify_id, weekly_tops.spotify_id),
           tot_with_radio = EXCLUDED.tot_with_radio,
           radio_impact   = EXCLUDED.radio_impact,
           consumption    = EXCLUDED.consumption,
           radio_pct      = EXCLUDED.radio_pct`,
        [
          week_date, s.position, song_id, isrc, s.spotify_id ?? null,
          s.tot_with_radio ?? null, s.radio_impact ?? null,
          s.consumption ?? null, s.radio_pct ?? null,
        ],
      );

      // 4. Update peak_chart_date if this is the best position ever
      await pool.query(
        `UPDATE songs SET peak_chart_date = $1
         WHERE song_id = $2
           AND (
             peak_chart_date IS NULL
             OR $3 < (
               SELECT MIN(position) FROM weekly_tops
               WHERE song_id = $2 AND week_start != $1
             )
           )`,
        [week_date, song_id, s.position],
      );
    }
    res.json({ ok: true, saved: songs.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/weekly-ranking/compare', async (req, res) => {
  try {
    const weeksRes = await pool.query(
      `SELECT DISTINCT week_start FROM weekly_tops ORDER BY week_start DESC LIMIT 2`,
    );
    if (weeksRes.rows.length < 2) {
      return res.status(404).json({ error: 'No hay suficientes semanas para comparar' });
    }
    const [currentWeek, prevWeek] = weeksRes.rows.map((r) => r.week_start);

    const result = await pool.query(
      `WITH peak AS (
         SELECT song_id,
                MIN(position)             AS peak_pos,
                COUNT(DISTINCT week_start) AS week_count
         FROM weekly_tops
         GROUP BY song_id
       ),
       reentry AS (
         SELECT DISTINCT song_id
         FROM weekly_tops
         WHERE week_start < $2
       )
       SELECT
         cur.position  AS this_week,
         prev.position AS last_week,
         s.title       AS song,
         s.artist      AS artists,
         p.peak_pos    AS posicion,
         s.spotify_url,
         s.cover_url,
         p.week_count,
         CASE
           WHEN prev.song_id IS NULL AND re.song_id IS NOT NULL THEN 1
           ELSE 0
         END           AS reentry
       FROM weekly_tops cur
       JOIN songs s ON s.song_id = cur.song_id
       LEFT JOIN weekly_tops prev
              ON prev.week_start = $2
             AND prev.song_id = cur.song_id
       LEFT JOIN peak p    ON p.song_id = cur.song_id
       LEFT JOIN reentry re ON re.song_id = cur.song_id
       WHERE cur.week_start = $1
       ORDER BY cur.position`,
      [currentWeek, prevWeek],
    );

    res.json({ currentWeek, prevWeek, rows: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── admin: dashboard stats ────────────────────────────────────────────────────

app.get('/api/admin/stats', requireAuth, async (req, res) => {
  try {
    const [songs, weeks, songMap, spotifyCache, recentWeeks] = await Promise.all([
      pool.query('SELECT COUNT(*) AS total FROM songs'),
      pool.query('SELECT COUNT(DISTINCT week_start) AS total FROM weekly_tops'),
      pool.query('SELECT COUNT(*) AS total FROM song_map'),
      pool.query('SELECT COUNT(*) AS total FROM songs WHERE spotify_url IS NOT NULL'),
      pool.query(`
        SELECT wt.week_start, COUNT(*) AS entries,
               ROUND(AVG(wt.tot_with_radio)::numeric, 0) AS avg_score,
               MIN(wt.position) AS best_pos
        FROM weekly_tops wt
        GROUP BY wt.week_start
        ORDER BY wt.week_start DESC
        LIMIT 10
      `),
    ]);
    res.json({
      totalSongs:    parseInt(songs.rows[0].total),
      totalWeeks:    parseInt(weeks.rows[0].total),
      totalSongMap:  parseInt(songMap.rows[0].total),
      spotifyCache:  parseInt(spotifyCache.rows[0].total),
      recentWeeks:   recentWeeks.rows,
    });
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
        `SELECT wt.*, s.title, s.artist, s.genre, s.cover_url, s.spotify_url
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

// ── admin: clear spotify cache ────────────────────────────────────────────────

app.delete('/api/admin/spotify-names', requireAuth, async (req, res) => {
  const { song_id } = req.body;
  try {
    await pool.query(
      `UPDATE songs SET spotify_title=NULL, spotify_artist=NULL, spotify_url=NULL, cover_url=NULL
       WHERE song_id=$1`,
      [song_id],
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/spotify-names/all', requireAuth, async (req, res) => {
  try {
    await pool.query(
      `UPDATE songs SET spotify_title=NULL, spotify_artist=NULL, spotify_url=NULL, cover_url=NULL`,
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = 3005;
app.listen(PORT, () => console.log(`API corriendo en http://localhost:${PORT}`));
