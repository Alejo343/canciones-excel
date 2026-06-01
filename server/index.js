const express = require('express');
const cors = require('cors');
const pool = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

// Devuelve todos los mappings (para carga inicial en el frontend)
app.get('/api/song-map', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM song_map ORDER BY confirmed_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Guarda o actualiza un mapping luminate <-> colombia radio
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
      [luminate_title, luminate_artist, isrc ?? null, codigo ?? null]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = 3001;
app.listen(PORT, () => console.log(`API corriendo en http://localhost:${PORT}`));
