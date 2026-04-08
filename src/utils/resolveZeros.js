import * as XLSX from "xlsx";

function normalize(str) {
  return String(str ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function findBestMatch(title, colombiaData) {
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

export function resolveZeros(calculatedFile, colombiaData) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const workbook = XLSX.read(e.target.result, { type: "binary" });
        const luminateSheet = workbook.Sheets["Luminate"];
        const luminateData = XLSX.utils.sheet_to_json(luminateSheet);

        const matchReport = [];
        const insertAt = 16; // columna Q

        luminateData.forEach((row, i) => {
          const rowNum = i + 2;
          const title = row["TITLE"] ?? "";
          const radioImpact = Number(row["Radio Impact Col"] ?? 0);

          if (radioImpact === 0) {
            const { best, matches } = findBestMatch(title, colombiaData);

            const impactos = best ? Number(best["IMPACTOS"] ?? 0) : 0;
            const radioWeighted = impactos / 27;
            const sonadas = best ? Number(best["SONADAS"] ?? 0) : 0;
            const top = best ? Number(best["TOP"] ?? 0) : 0;

            const j = Number(row[Object.keys(row)[9]] ?? 0);
            const n = Number(row[Object.keys(row)[13]] ?? 0);
            const p = Number(row[Object.keys(row)[15]] ?? 0);
            const consumption = j + n + p;
            const totWithRadio = radioWeighted + consumption;
            const radioPercent =
              totWithRadio !== 0 ? radioWeighted / totWithRadio : 0;

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

            matchReport.push({
              title,
              chosen: best ? best["CANCION"] : "Sin coincidencia",
              impactos,
              totalOptions: matches.length,
              options: matches.map((m) => ({
                cancion: m["CANCION"] ?? "",
                impactos: Number(m["IMPACTOS"] ?? 0),
              })),
            });
          }
        });

        const { saveAs } = await import("file-saver");
        const buffer = XLSX.write(workbook, {
          bookType: "xlsx",
          type: "array",
        });
        const blob = new Blob([buffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        saveAs(blob, "Hot 100 Final.xlsx");

        resolve(matchReport);
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = (err) => reject(err);
    reader.readAsBinaryString(calculatedFile);
  });
}
