export async function fetchSongMap() {
  const res = await fetch('/api/song-map');
  if (!res.ok) throw new Error('Error al cargar song map');
  return res.json(); // [{ luminate_title, luminate_artist, isrc, codigo }]
}

export async function saveSongMap(luminateTitle, luminateArtist, isrc, codigo) {
  const res = await fetch('/api/song-map', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      luminate_title: luminateTitle,
      luminate_artist: luminateArtist,
      isrc: isrc ?? null,
      codigo: codigo ?? null,
    }),
  });
  if (!res.ok) throw new Error('Error al guardar song map');
  return res.json();
}
