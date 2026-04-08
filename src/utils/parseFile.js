import * as XLSX from "xlsx";
import Papa from "papaparse";

export function parseFile(file) {
  return new Promise((resolve, reject) => {
    const ext = file.name.split(".").pop().toLowerCase();

    if (ext === "csv") {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => resolve(results.data),
        error: (err) => reject(err),
      });
    } else if (ext === "xlsx" || ext === "xls") {
      const reader = new FileReader();
      reader.onload = (e) => {
        const workbook = XLSX.read(e.target.result, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet);
        resolve(data);
      };
      reader.onerror = (err) => reject(err);
      reader.readAsBinaryString(file);
    } else {
      reject(new Error("Formato no soportado. Usa .csv, .xlsx o .xls"));
    }
  });
}
