import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

const NEW_COLS = [
  "Radio Impact Col",
  "Radio Weighted",
  "Played Radio Col",
  "Top Radio Col",
  "Consumption",
  "Tot w/ Radio",
  "Radio %",
];

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

function buildFormula(colName, rowNum) {
  switch (colName) {
    case "Radio Impact Col":
      return `IFERROR(VLOOKUP(F${rowNum},'Colombia Radio'!$D$2:$F$97118,2,0),0)`;
    case "Radio Weighted":
      return `SUM(Q${rowNum}/27)`;
    case "Played Radio Col":
      return `IFERROR(VLOOKUP(F${rowNum},'Colombia Radio'!$D$2:$F$69000,3,0),0)`;
    case "Top Radio Col":
      return `IFERROR(VLOOKUP(F${rowNum},'Colombia Radio'!$D$2:$G$69000,4,0),0)`;
    case "Consumption":
      return `SUM(J${rowNum},N${rowNum},P${rowNum})`;
    case "Tot w/ Radio":
      return `SUM(R${rowNum},U${rowNum})`;
    case "Radio %":
      return `SUM(R${rowNum}/V${rowNum})`;
    default:
      return "";
  }
}

export function generateExcel(luminateData, colombiaData) {
  const workbook = XLSX.utils.book_new();

  const headers = Object.keys(luminateData[0]);
  const insertAt = 16;

  const newHeaders = [
    ...headers.slice(0, insertAt),
    ...NEW_COLS,
    ...headers.slice(insertAt),
  ];

  const worksheetData = [newHeaders];

  luminateData.forEach((row) => {
    const values = headers.map((h) => row[h] ?? "");
    const newRow = [
      ...values.slice(0, insertAt),
      ...NEW_COLS.map(() => null),
      ...values.slice(insertAt),
    ];
    worksheetData.push(newRow);
  });

  const luminateSheet = XLSX.utils.aoa_to_sheet(worksheetData);

  luminateData.forEach((row, i) => {
    const rowNum = i + 2;
    NEW_COLS.forEach((colName, j) => {
      const colIndex = insertAt + j;
      const cellRef = `${colLetter(colIndex)}${rowNum}`;
      luminateSheet[cellRef] = { t: "n", f: buildFormula(colName, rowNum) };
    });
  });

  XLSX.utils.book_append_sheet(workbook, luminateSheet, "Luminate");

  const colombiaSheet = XLSX.utils.json_to_sheet(colombiaData);
  XLSX.utils.book_append_sheet(workbook, colombiaSheet, "Colombia Radio");

  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  saveAs(blob, "Hot 100.xlsx");

  return [];
}
