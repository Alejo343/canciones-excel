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

export function findBestMatch(title, artist, colombiaData) {
  const normalTitle = normalize(title);
  const normalArtist = normalize(artist ?? "");

  function titleScore(cancion) {
    const normalCancion = normalize(cancion);

    // Match exacto
    if (normalCancion === normalTitle) return 70;

    // Título de Luminate contenido en Colombia Radio
    if (normalCancion.includes(normalTitle)) {
      const coverage = normalTitle.length / normalCancion.length;
      if (coverage >= 0.4) return Math.round(60 * coverage);
      return 0;
    }

    // Título de Colombia Radio contenido en Luminate
    if (normalTitle.includes(normalCancion)) {
      const coverage = normalCancion.length / normalTitle.length;
      if (coverage >= 0.8) return Math.round(55 * coverage);
      return 0;
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
    const radioWeighted = impactos / 27;
    const j = Number(values.j ?? 0);
    const n = Number(values.n ?? 0);
    const p = Number(values.p ?? 0);
    const consumption = j + n + p;
    const totWithRadio = radioWeighted + consumption;
    const radioPercent = totWithRadio !== 0 ? radioWeighted / totWithRadio : 0;

    const directValues = [
      impactos,
      radioWeighted,
      sonadas,
      top,
      consumption,
      totWithRadio,
      radioPercent,
    ];

    directValues.forEach((val, j) => {
      const colIndex = insertAt + j;
      const cellRef = `${colLetter(colIndex)}${rowNum}`;
      const isPercentCol = colIndex === INSERT_AT + NEW_COLS_COUNT - 1;
      luminateSheet[cellRef] = {
        t: "n",
        v: val,
        s: dataStyleR(true, rowNum % 2 === 0, isPercentCol, colIndex),
      };
    });
  });

  return workbook;
}

export function sortByTotWithRadio(workbook) {
  const sheet = workbook.Sheets["Luminate"];

  const allRows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const rankColName = allRows[0]?.[2];
  const totalCols = allRows[0]?.length ?? 0;

  const data = XLSX.utils.sheet_to_json(sheet);

  data.sort((a, b) => {
    const aVal = Number(a["Tot w/ Radio"] ?? 0);
    const bVal = Number(b["Tot w/ Radio"] ?? 0);
    return bVal - aVal;
  });

  if (rankColName) {
    data.forEach((row, i) => {
      row[rankColName] = i + 1;
    });
  }

  const newSheet = XLSX.utils.json_to_sheet(data);
  applyLuminateStyles(newSheet, data.length, totalCols);
  workbook.Sheets["Luminate"] = newSheet;
  return workbook;
}

export function applyTableStyle(workbook) {
  const sheet = workbook.Sheets["Luminate"];
  const ref = sheet["!ref"];
  if (!ref) return workbook;

  if (!sheet["!tables"]) sheet["!tables"] = [];
  sheet["!tables"].push({
    name: "TablHot100",
    ref: ref,
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

export function downloadResolved(workbook, fileName = "Hot 100 Final.xlsx") {
  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
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
