function similarity(a, b) {
  if (!a || !b) return 0;
  a = a.toLowerCase();
  b = b.toLowerCase();

  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;

  if (longer.length === 0) return 1.0;

  const editDistance = levenshtein(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function levenshtein(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function normalizeArtist(artist) {
  if (!artist) return "";
  return artist
    .toLowerCase()
    .replace(/feat\.|ft\.|featuring|feat|ft/g, "")
    .trim();
}

function parseArtists(artistString) {
  if (!artistString) return [];
  return artistString
    .replace(/ & /g, ", ")
    .split(",")
    .map((a) => normalizeArtist(a.trim()))
    .filter(Boolean);
}

function checkArtistMatch(searchedArtists, resultArtistString) {
  if (!searchedArtists.length || !resultArtistString) return false;
  const resultNorm = normalizeArtist(resultArtistString);
  return searchedArtists.some(
    (artist) =>
      artist && (resultNorm.includes(artist) || artist.includes(resultNorm)),
  );
}

function isLegitimateRemix(title) {
  if (!title) return false;
  return ["remix", "rmx", "mix"].some((k) => title.toLowerCase().includes(k));
}

function calculateTrackScore(track, searchedTitle, searchedArtists, isRemix, threshold = 0.6) {
  const trackName = track.name || "";
  const artistNames = track.artists.map((a) => a.name).join(", ");
  const popularity = track.popularity || 0;

  const unwanted = ["remix", "rmx", "mix", "edit", "version", "live", "acoustic", "instrumental", "cover", "karaoke"];

  if (!isRemix && unwanted.some((k) => trackName.toLowerCase().includes(k))) {
    return { score: 0, reason: "Contiene keyword no deseada" };
  }

  const titleSim = similarity(searchedTitle, trackName);
  if (titleSim < threshold) {
    return { score: 0, reason: `Similitud muy baja (${titleSim.toFixed(2)})` };
  }

  const artistMatch = checkArtistMatch(searchedArtists, artistNames);
  if (searchedArtists.length && !artistMatch) {
    return { score: 0, reason: "Artista no coincide" };
  }

  const score = titleSim * 100 + (artistMatch ? 100 : 0) + (popularity / 100) * 50;
  return { score, reason: `✓ Sim:${titleSim.toFixed(2)} Artist:${artistMatch} Pop:${popularity}` };
}

module.exports = { calculateTrackScore, parseArtists, isLegitimateRemix };
