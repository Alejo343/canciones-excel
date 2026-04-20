import XLSX from "xlsx-js-style";
import { saveAs } from "file-saver";

const INSERT_AT = 16;
const NEW_COLS_COUNT = 7;

const THIN_BORDER = {
  top: { style: "thin", color: { rgb: "B0B0B0" } },
  bottom: { style: "thin", color: { rgb: "B0B0B0" } },
  left: { style: "thin", color: { rgb: "B0B0B0" } },
  right: { style: "thin", color: { rgb: "B0B0B0" } },
};

function colLetter(index) {
  let letter = "";
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

function headerStyleR(isNewCol) {
  return {
    fill: { fgColor: { rgb: isNewCol ? "C65911" : "1F4E79" } },
    font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border: THIN_BORDER,
  };
}

function dataStyleR(isNewCol, isEvenRow, isPercentCol = false, colIndex = -1) {
  let rgb;
  if (isNewCol) rgb = isEvenRow ? "FCE4D6" : "FFF2CC";
  else rgb = isEvenRow ? "D9E1F2" : "FFFFFF";
  const style = {
    fill: { fgColor: { rgb } },
    font: { sz: 11 },
    alignment: { vertical: "center" },
    border: THIN_BORDER,
  };
  if (isPercentCol) style.numFmt = "0.00%";
  else if ((colIndex >= 6 && colIndex <= 21) || (colIndex >= 23 && colIndex <= 25))
    style.numFmt = "#,##0";
  return style;
}

function applyLuminateStyles(sheet, totalRows, totalCols) {
  const radioPercentCol = INSERT_AT + NEW_COLS_COUNT - 1;
  for (let c = 0; c < totalCols; c++) {
    const isNewCol = c >= INSERT_AT && c < INSERT_AT + NEW_COLS_COUNT;
    const isPercentCol = c === radioPercentCol;
    const headerRef = `${colLetter(c)}1`;
    if (sheet[headerRef]) sheet[headerRef].s = headerStyleR(isNewCol);
    for (let r = 2; r <= totalRows + 1; r++) {
      const cellRef = `${colLetter(c)}${r}`;
      if (sheet[cellRef]) sheet[cellRef].s = dataStyleR(isNewCol, r % 2 === 0, isPercentCol, c);
    }
  }
}

function normalize(str) {
  return String(str ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['''`.]/g, "")
    .replace(/\s+/g, " ")
    .toUpperCase()
    .trim();
}

// Quita paréntesis/corchetes y sufijos de variante (REMIX, RMX, VERSION, etc.)
// para obtener el "core" del título y poder comparar "CHEVERE (premium_remix)" con "CHEVERE"
// o "Cuando No Era Cantante Remix Version" con "Cuando No Era Cantante RMX".
function stripVariants(s) {
  let result = s
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[_\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const trailingRx =
    /\s+(REMIX|RMX|VERSION|EDIT|EXTENDED|ACOUSTIC|LIVE|PREMIUM|ORIGINAL|REMASTERED|DELUXE|BONUS|SPED UP|SLOWED|RADIO EDIT)$/;
  while (trailingRx.test(result)) {
    result = result.replace(trailingRx, "").trim();
  }
  return result;
}

function tokenize(s) {
  return new Set(s.split(" ").filter((t) => t.length >= 2));
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

export function findBestMatch(title, artist, colombiaData) {
  const normalTitle = normalize(title);
  const normalArtist = normalize(artist ?? "");
  const coreTitle = stripVariants(normalTitle);
  const coreTitleTokens = tokenize(coreTitle);

  function titleScore(cancion) {
    const normalCancion = normalize(cancion);
    const coreCancion = stripVariants(normalCancion);

    // Match exacto
    if (normalCancion === normalTitle) return 70;

    // Match exacto de la versión "core" (sin sufijos de variante / paréntesis)
    if (coreCancion && coreTitle && coreCancion === coreTitle) return 68;

    // Título de Luminate contenido en Colombia Radio
    if (normalCancion.includes(normalTitle)) {
      const coverage = normalTitle.length / normalCancion.length;
      if (coverage >= 0.4) return Math.round(60 * coverage);
    }

    // Título de Colombia Radio contenido en Luminate
    if (normalTitle.includes(normalCancion)) {
      const coverage = normalCancion.length / normalTitle.length;
      if (coverage >= 0.8) return Math.round(55 * coverage);
    }

    // Contención con la versión "core"
    if (coreCancion && coreTitle && coreTitle.length >= 4 && coreCancion.length >= 4) {
      if (coreCancion.includes(coreTitle)) {
        const coverage = coreTitle.length / coreCancion.length;
        if (coverage >= 0.5) return Math.round(55 * coverage);
      }
      if (coreTitle.includes(coreCancion)) {
        const coverage = coreCancion.length / coreTitle.length;
        if (coverage >= 0.5) return Math.round(50 * coverage);
      }

      // Fallback por tokens compartidos (Jaccard) sobre el core
      const j = jaccard(coreTitleTokens, tokenize(coreCancion));
      if (j >= 0.6) return Math.round(55 * j);
    }

    return 0;
  }

  function artistScore(artista) {
    const normalArtistCol = normalize(artista ?? "");
    if (!normalArtist || !normalArtistCol) return 0;

    // Dividir artistas por coma o slash
    const artistsLuminate = normalArtist
      .replace(/"/g, "")
      .split(/[,/&]/)
      .map((a) => a.trim());
    const artistsColombia = normalArtistCol
      .replace(/"/g, "")
      .split(/[,/&]/)
      .map((a) => a.trim());

    let score = 0;
    for (const a of artistsLuminate) {
      for (const b of artistsColombia) {
        if (a === b) {
          score = 30;
          break;
        }
        if (a.includes(b) || b.includes(a)) {
          score = Math.max(score, 15);
        }
      }
    }
    return score;
  }

  const scored = colombiaData
    .map((row) => {
      const ts = titleScore(row["CANCION"] ?? "");
      if (ts === 0) return null;
      const as = artistScore(row["ARTISTA"] ?? "");
      return { row, score: ts + as, titleScore: ts, artistScore: as };
    })
    .filter(Boolean);

  if (scored.length === 0) return { best: null, matches: [] };

  const matches = scored.map((s) => ({
    cancion: s.row["CANCION"] ?? "",
    artista: s.row["ARTISTA"] ?? "",
    impactos: Number(s.row["IMPACTOS"] ?? 0),
    sonadas: Number(s.row["SONADAS"] ?? 0),
    top: Number(s.row["TOP"] ?? 0),
    score: s.score,
  }));

  const sorted = [...scored].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.artistScore !== a.artistScore) return b.artistScore - a.artistScore;
    return Number(b.row["IMPACTOS"] ?? 0) - Number(a.row["IMPACTOS"] ?? 0);
  });

  // Si ninguna opción tiene coincidencia de artista, no mostrar nada
  const anyArtistMatch = sorted.some((s) => s.artistScore > 0);
  if (!anyArtistMatch) return { best: null, matches: [] };
  console.log(
    `[${normalTitle}] anyArtistMatch: ${anyArtistMatch}`,
    sorted.map((s) => ({
      cancion: s.row["CANCION"],
      artista: s.row["ARTISTA"],
      artistScore: s.artistScore,
    })),
  );
  if (!anyArtistMatch) return { best: null, matches };

  // Si el mejor tiene 0 impactos, buscar uno con impactos dentro del mismo score de título
  const best = sorted[0];
  if (Number(best.row["IMPACTOS"] ?? 0) === 0) {
    const withImpactos = sorted.find((s) => Number(s.row["IMPACTOS"] ?? 0) > 0);
    if (withImpactos) return { best: withImpactos.row, matches };
  }

  return { best: sorted[0].row, matches };
}

export function extractZeroRows(calculatedData, colombiaData) {
  const first100 = calculatedData.slice(0, 100);

  return first100
    .map((row, i) => {
      const rowNum = i + 2;
      const radioImpact = Number(row["Radio Impact Col"] ?? 0);
      if (radioImpact !== 0) return null;

      const title = row["TITLE"] ?? "";
      const artist = row["ARTIST"] ?? "";
      const { best, matches } = findBestMatch(title, artist, colombiaData);

      return {
        rowNum,
        title,
        artist,
        best: best
          ? {
              cancion: best["CANCION"],
              artista: best["ARTISTA"],
              impactos: Number(best["IMPACTOS"] ?? 0),
              sonadas: Number(best["SONADAS"] ?? 0),
              top: Number(best["TOP"] ?? 0),
            }
          : null,
        options: best
          ? [
              matches.find(
                (m) =>
                  m.cancion === best["CANCION"] &&
                  m.artista === best["ARTISTA"],
              ),
              ...matches.filter(
                (m) =>
                  !(
                    m.cancion === best["CANCION"] &&
                    m.artista === best["ARTISTA"]
                  ),
              ),
            ].filter(Boolean)
          : matches,
      };
    })
    .filter(Boolean);
}

export function applyResolutions(workbook, resolutions) {
  const luminateSheet = workbook.Sheets["Luminate"];
  const insertAt = 16;

  Object.entries(resolutions).forEach(([rowNum, values]) => {
    const { impactos, sonadas, top } = values;
    const rn = Number(rowNum);

    // Solo reemplazar los 3 valores de lookup directo
    [
      { offset: 0, val: impactos },
      { offset: 2, val: sonadas },
      { offset: 3, val: top },
    ].forEach(({ offset, val }) => {
      const colIndex = insertAt + offset;
      const cellRef = `${colLetter(colIndex)}${rowNum}`;
      luminateSheet[cellRef] = {
        t: "n",
        v: val,
        s: dataStyleR(true, rn % 2 === 0, false, colIndex),
      };
    });

    // Restaurar fórmulas en las columnas derivadas
    [
      { offset: 1, f: `SUM(Q${rowNum}/27)` },
      { offset: 4, f: `SUM(J${rowNum},N${rowNum},P${rowNum})` },
      { offset: 5, f: `SUM(R${rowNum},U${rowNum})` },
      { offset: 6, f: `SUM(R${rowNum}/V${rowNum})` },
    ].forEach(({ offset, f }) => {
      const colIndex = insertAt + offset;
      const cellRef = `${colLetter(colIndex)}${rowNum}`;
      const isPercentCol = colIndex === INSERT_AT + NEW_COLS_COUNT - 1;
      luminateSheet[cellRef] = {
        t: "n",
        f,
        s: dataStyleR(true, rn % 2 === 0, isPercentCol, colIndex),
      };
    });
  });

  return workbook;
}

export function sortByTotWithRadio(workbook) {
  const sheet = workbook.Sheets["Luminate"];
  const range = XLSX.utils.decode_range(sheet["!ref"]);

  // Localizar columnas por encabezado (Tot w/ Radio y sus componentes fuente)
  const headerIdx = {};
  for (let c = 0; c <= range.e.c; c++) {
    const v = sheet[XLSX.utils.encode_cell({ r: 0, c })]?.v;
    if (typeof v === "string") headerIdx[v] = c;
  }
  const totColIndex = headerIdx["Tot w/ Radio"] ?? -1;
  const radioImpactIdx = headerIdx["Radio Impact Col"] ?? -1;
  const weightedAudioIdx = headerIdx["WEIGHTED_AUDIO"] ?? 9;
  const weightedVideoIdx = headerIdx["WEIGHTED_VIDEO"] ?? 13;
  const weightedSalesIdx = headerIdx["WEIGHTED_SONG_SALES"] ?? 15;

  const numOr0 = (v) => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  // Tot w/ Radio = Radio Weighted + Consumption = Q/27 + J + N + P.
  // Preferimos el valor cacheado de Excel si es un número válido; si no,
  // lo recalculamos desde las celdas fuente (evita que filas sin cache
  // queden con 0 y "rompan" el orden descendente).
  const totValue = (cells) => {
    const cached = cells[totColIndex]?.v;
    if (typeof cached === "number" && Number.isFinite(cached)) return cached;
    const q = numOr0(cells[radioImpactIdx]?.v);
    const j = numOr0(cells[weightedAudioIdx]?.v);
    const n = numOr0(cells[weightedVideoIdx]?.v);
    const p = numOr0(cells[weightedSalesIdx]?.v);
    return q / 27 + j + n + p;
  };

  // Read data rows as cell objects, preserving formulas
  const rows = [];
  for (let r = 1; r <= range.e.r; r++) {
    const cells = [];
    for (let c = 0; c <= range.e.c; c++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      cells.push(sheet[ref] ? { ...sheet[ref] } : null);
    }
    rows.push({ cells, originalRow: r + 1, sortVal: totValue(cells) });
  }

  // Sort descending by Tot w/ Radio value (calculado/cacheado)
  rows.sort((a, b) => b.sortVal - a.sortVal);

  // Clear all data cells (keep header row 0)
  for (let r = 1; r <= range.e.r; r++) {
    for (let c = 0; c <= range.e.c; c++) {
      delete sheet[XLSX.utils.encode_cell({ r, c })];
    }
  }

  // Write rows back: update formula row refs and fix even/odd styles
  rows.forEach(({ cells, originalRow }, rowIdx) => {
    const newRow = rowIdx + 2; // new 1-based sheet row number
    const isEvenRow = newRow % 2 === 0;

    cells.forEach((cell, c) => {
      if (!cell) return;
      const ref = XLSX.utils.encode_cell({ r: rowIdx + 1, c });
      const isNewCol = c >= INSERT_AT && c < INSERT_AT + NEW_COLS_COUNT;
      const isPercentCol = c === INSERT_AT + NEW_COLS_COUNT - 1;

      const newCell = { ...cell };
      // Update row numbers inside formula (only non-absolute refs like F3, not $C$2)
      if (cell.f) {
        newCell.f = cell.f.replace(/([A-Z]+)(\d+)/g, (_, col, num) =>
          Number(num) === originalRow ? col + newRow : col + num,
        );
      }
      newCell.s = dataStyleR(isNewCol, isEvenRow, isPercentCol, c);
      sheet[ref] = newCell;
    });

    // Update rank value (column index 2 = C)
    const rankRef = XLSX.utils.encode_cell({ r: rowIdx + 1, c: 2 });
    if (sheet[rankRef]) {
      sheet[rankRef] = { ...sheet[rankRef], t: "n", v: rowIdx + 1, f: undefined };
    }
  });

  return workbook;
}

export function applyTableStyle(workbook) {
  const sheet = workbook.Sheets["Luminate"];
  const ref = sheet["!ref"];
  if (!ref) return workbook;

  const range = XLSX.utils.decode_range(ref);

  // Congelar fila de encabezado
  sheet["!views"] = [{ state: "frozen", ySplit: 1 }];

  // Altura del encabezado
  sheet["!rows"] = [{ hpt: 32 }];

  // Anchos de columna
  const cols = [];
  for (let c = 0; c <= range.e.c; c++) {
    const header = sheet[XLSX.utils.encode_cell({ r: 0, c })]?.v ?? "";
    if (["TITLE", "ARTIST", "CANCION", "ARTISTA"].includes(String(header).toUpperCase()))
      cols.push({ wch: 32 });
    else if (c >= INSERT_AT && c < INSERT_AT + NEW_COLS_COUNT)
      cols.push({ wch: 16 });
    else
      cols.push({ wch: 13 });
  }
  sheet["!cols"] = cols;

  if (!sheet["!tables"]) sheet["!tables"] = [];
  sheet["!tables"].push({
    name: "TablHot100",
    ref,
    headerRow: true,
    totalsRow: false,
    style: {
      name: "TableStyleMedium9",
      showFirstColumn: false,
      showLastColumn: false,
      showRowStripes: true,
      showColumnStripes: false,
    },
  });

  return workbook;
}

export function getWorkbookBuffer(workbook) {
  return XLSX.write(workbook, { bookType: "xlsx", type: "array" });
}

export function downloadResolved(workbook, fileName = "Hot 100 Final.xlsx") {
  const buffer = getWorkbookBuffer(workbook);
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  saveAs(blob, fileName);
}

export function readWorkbook(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target.result, { type: "binary" });

        const luminateSheet = workbook.Sheets["Luminate"];
        const colombiaSheet = workbook.Sheets["Colombia Radio"];

        if (!luminateSheet) throw new Error("No se encontró la hoja Luminate");
        if (!colombiaSheet)
          throw new Error("No se encontró la hoja Colombia Radio");

        const luminateData = XLSX.utils.sheet_to_json(luminateSheet);
        const colombiaData = XLSX.utils.sheet_to_json(colombiaSheet);

        resolve({ workbook, data: luminateData, colombiaData });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsBinaryString(file);
  });
}
