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

// Lanza búsqueda Spotify vía SSE. Devuelve un EventSource que el llamador debe cerrar.
// onProgress(index, total, song), onResult(entry, cached), onDone(total), onError(err)
export function startSpotifySearch(songs, { onProgress, onResult, onDone, onError }) {
  fetch('/api/spotify-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ songs }),
  }).then(async (res) => {
    if (!res.ok) {
      onError?.(new Error(`HTTP ${res.status}`));
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // conservar línea incompleta
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const msg = JSON.parse(line.slice(6));
          if (msg.type === 'progress') onProgress?.(msg.index, msg.total, msg.song);
          else if (msg.type === 'result') onResult?.(msg.entry, msg.cached);
          else if (msg.type === 'done') onDone?.(msg.total);
        } catch {}
      }
    }
  }).catch((e) => onError?.(e));
}
