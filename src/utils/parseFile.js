import * as XLSX from "xlsx";
import Papa from "papaparse";

function cleanColName(name) {
  return String(name ?? "")
    .replace(/^="?|"?$/g, "")
    .trim();
}

function isTechnicalColumn(name) {
  const cleaned = cleanColName(name);
  return (
    cleaned.includes("(") ||
    cleaned.includes(")") ||
    cleaned.includes(".") ||
    /^hex/i.test(cleaned) ||
    /^[0-9a-f]{8,}$/i.test(cleaned)
  );
}

function cleanData(data) {
  if (!data || data.length === 0) return data;
  const allCols = Object.keys(data[0]);
  const validCols = allCols.filter((col) => !isTechnicalColumn(col));
  return data.map((row) => {
    const clean = {};
    for (const col of validCols) {
      const cleanedKey = cleanColName(col);
      const val = String(row[col] ?? "")
        .replace(/^="?|"?$/g, "")
        .trim();
      clean[cleanedKey] = val || row[col];
    }
    return clean;
  });
}

export function parseFile(file) {
  return new Promise((resolve, reject) => {
    const ext = file.name.split(".").pop().toLowerCase();

    if (ext === "csv") {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => resolve(cleanData(results.data)),
        error: (err) => reject(err),
      });
    } else if (ext === "xlsx" || ext === "xls") {
      const reader = new FileReader();
      reader.onload = (e) => {
        const workbook = XLSX.read(e.target.result, { type: "binary" });
        let bestSheet = null;
        let bestScore = -1;
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          const data = XLSX.utils.sheet_to_json(sheet);
          if (data.length === 0) continue;
          const cols = Object.keys(data[0]);
          const usefulCols = cols.filter((c) => !isTechnicalColumn(c));
          if (usefulCols.length > bestScore) {
            bestScore = usefulCols.length;
            bestSheet = sheetName;
          }
        }
        const sheet = workbook.Sheets[bestSheet ?? workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet);
        resolve(cleanData(data));
      };
      reader.onerror = (err) => reject(err);
      reader.readAsBinaryString(file);
    } else {
      reject(new Error("Formato no soportado. Usa .csv, .xlsx o .xls"));
    }
  });
}
