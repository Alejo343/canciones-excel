const REQUIRED_FIELDS = [
  {
    key: "CANCION",
    label: "Canción",
    candidates: [
      "CANCION",
      "CANCIÓN",
      "SONG",
      "TITULO",
      "TÍTULO",
      "TRACK",
      "NOMBRE",
    ],
  },
  {
    key: "ARTISTA",
    label: "Artista",
    candidates: ["ARTISTA", "ARTIST", "INTERPRETE", "INTÉRPRETE", "AUTOR"],
  },
  {
    key: "IMPACTOS",
    label: "Impactos",
    candidates: ["IMPACTOS", "IMPACTO", "IMPACTS", "AUDIENCE", "AUDIENCIA"],
  },
  {
    key: "SONADAS",
    label: "Sonadas",
    candidates: ["SONADAS", "SONADA", "PLAYS", "SPINS", "AIRPLAY"],
  },
  {
    key: "TOP",
    label: "Top",
    candidates: ["TOP", "RANKING", "RANK", "POSICION", "POSICIÓN", "POSITION"],
  },
];

function normalize(str) {
  return String(str ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['''`.]/g, "")
    .toUpperCase()
    .trim();
}

function scoreMatch(colName, candidates) {
  const normalCol = normalize(colName);

  // Match exacto
  if (candidates.some((c) => normalize(c) === normalCol)) return 100;

  // Match parcial
  if (
    candidates.some(
      (c) =>
        normalCol.includes(normalize(c)) || normalize(c).includes(normalCol),
    )
  )
    return 60;

  return 0;
}

export function detectColumns(data) {
  if (!data || data.length === 0) return null;

  const columns = Object.keys(data[0]);
  const mapping = {};
  const usedCols = new Set();

  for (const field of REQUIRED_FIELDS) {
    let bestCol = null;
    let bestScore = 0;

    for (const col of columns) {
      if (usedCols.has(col)) continue;
      const s = scoreMatch(col, field.candidates);
      if (s > bestScore) {
        bestScore = s;
        bestCol = col;
      }
    }

    mapping[field.key] = {
      detectedCol: bestCol,
      score: bestScore,
      confirmed: bestScore === 100,
    };

    if (bestCol) usedCols.add(bestCol);
  }

  return mapping;
}

export function applyMapping(data, mapping) {
  return data.map((row) => {
    const mapped = {};
    for (const [fieldKey, { detectedCol }] of Object.entries(mapping)) {
      mapped[fieldKey] = detectedCol ? (row[detectedCol] ?? "") : "";
    }
    // Conservar columnas extra
    Object.keys(row).forEach((col) => {
      const isUsed = Object.values(mapping).some((m) => m.detectedCol === col);
      if (!isUsed) mapped[col] = row[col];
    });
    return mapped;
  });
}

export { REQUIRED_FIELDS };
