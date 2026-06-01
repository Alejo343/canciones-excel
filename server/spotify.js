const {
  calculateTrackScore,
  parseArtists,
  isLegitimateRemix,
} = require("./scorer");

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const SEARCH_URL = "https://api.spotify.com/v1/search";

const CLIENT_ID = "2ee0b59bc85a479082781795bce910f4";
const CLIENT_SECRET = "47c2124a6750417b9a00a3cd9ee9cfcf";

let cachedToken = null;
let tokenExpiry = 0;

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const creds = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const data = await res.json();
  if (!data.access_token) {
    console.error("[Spotify] Error obteniendo token:", JSON.stringify(data));
    throw new Error("No se pudo obtener token de Spotify");
  }

  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

async function searchTrack(title, artist, threshold = 0.6) {
  const token = await getToken();
  const query = `${title} ${artist}`.trim();
  const searchedArtists = parseArtists(artist);
  const isRemix = isLegitimateRemix(title);

  const url = `${SEARCH_URL}?q=${encodeURIComponent(query)}&type=track&limit=10`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const text = await res.text();

  if (res.status !== 200) {
    console.error(`[Spotify] HTTP ${res.status} para "${title}":`, text.substring(0, 200));
    return null;
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    console.error(`[Spotify] JSON inválido para "${title}":`, text.substring(0, 200));
    return null;
  }

  const items = data.tracks?.items || [];
  if (!items.length) return null;

  const scored = items.map((track) => {
    const { score, reason } = calculateTrackScore(track, title, searchedArtists, isRemix, threshold);
    return { score, track, reason };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];

  if (best.score === 0) return null;

  const track = best.track;
  const artistNames = track.artists.map((a) => a.name).join(", ");
  const images = track.album?.images || [];

  return {
    spotify: track.external_urls?.spotify || null,
    song: track.name,
    artist: artistNames,
    cover: images[0]?.url || null,
  };
}

module.exports = { searchTrack };
