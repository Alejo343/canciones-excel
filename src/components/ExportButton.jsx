import { generateExcel } from "../utils/generateExcel";

export default function ExportButton({ data }) {
  if (!data || data.length === 0) return null;

  const handleExport = () => {
    generateExcel(data, "archivo-generado");
  };

  return (
    <div className="mt-6">
      <button
        onClick={handleExport}
        className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors"
      >
        ⬇ Descargar Excel
      </button>
    </div>
  );
}
