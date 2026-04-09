import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

function normalize(str) {
  return String(str ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

export function findBestMatch(title, colombiaData) {
  const normalTitle = normalize(title);

  const matches = colombiaData.filter((row) => {
    const normalCancion = normalize(row["CANCION"]);
    return (
      normalCancion.includes(normalTitle) || normalTitle.includes(normalCancion)
    );
  });

  if (matches.length === 0) return { best: null, matches: [] };

  const best = matches.reduce((prev, curr) => {
    return Number(curr["IMPACTOS"] ?? 0) > Number(prev["IMPACTOS"] ?? 0)
      ? curr
      : prev;
  });

  return { best, matches };
}

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

export function extractZeroRows(calculatedData, colombiaData) {
  // Solo primeras 100 canciones
  const first100 = calculatedData.slice(0, 100);

  return first100
    .map((row, i) => {
      const rowNum = i + 2;
      const radioImpact = Number(row["Radio Impact Col"] ?? 0);
      if (radioImpact !== 0) return null;

      const title = row["TITLE"] ?? "";
      const { best, matches } = findBestMatch(title, colombiaData);

      const artist = row["ARTIST"] ?? "";
      return {
        rowNum,
        title,
        artist,
        best: best
          ? {
              cancion: best["CANCION"],
              impactos: Number(best["IMPACTOS"] ?? 0),
              sonadas: Number(best["SONADAS"] ?? 0),
              top: Number(best["TOP"] ?? 0),
            }
          : null,
        options: matches
          .map((m) => ({
            cancion: m["CANCION"] ?? "",
            artista: m["ARTISTA"] ?? "",
            impactos: Number(m["IMPACTOS"] ?? 0),
            sonadas: Number(m["SONADAS"] ?? 0),
            top: Number(m["TOP"] ?? 0),
          }))
          .sort((a, b) => b.impactos - a.impactos),
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
      luminateSheet[cellRef] = { t: "n", v: val };
    });
  });

  return workbook;
}

export function sortByTotWithRadio(workbook) {
  const sheet = workbook.Sheets["Luminate"];
  const data = XLSX.utils.sheet_to_json(sheet);

  data.sort((a, b) => {
    const aVal = Number(a["Tot w/ Radio"] ?? 0);
    const bVal = Number(b["Tot w/ Radio"] ?? 0);
    return bVal - aVal;
  });

  const newSheet = XLSX.utils.json_to_sheet(data);
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
        const sheet = workbook.Sheets["Luminate"];
        const data = XLSX.utils.sheet_to_json(sheet);
        resolve({ workbook, data });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsBinaryString(file);
  });
}
