import { useState } from "react";
import { useNavigate } from "react-router-dom";
import DropZone from "../components/DropZone";
import DataPreview from "../components/DataPreview";
import ColumnMapper from "../components/ColumnMapper";
import useStore from "../store/useStore";
import { generateExcel } from "../utils/generateExcel";
import { detectColumns, applyMapping } from "../utils/detectColumns";

export default function Step1() {
  const navigate = useNavigate();
  const { luminateData, colombiaData, setLuminateData, setColombaData } =
    useStore();

  const [generating, setGenerating] = useState(false);
  const [success, setSuccess] = useState(false);
  const [rawColombia, setRawColombia] = useState(null);
  const [mapping, setMapping] = useState(null);
  const [columns, setColumns] = useState([]);
  const [mappingConfirmed, setMappingConfirmed] = useState(false);

  const canExport = luminateData && colombiaData && mappingConfirmed;

  const handleColombiLoaded = (data) => {
    setRawColombia(data);
    setMappingConfirmed(false);
    setColombaData(null);
    const detected = detectColumns(data);
    const cols = Object.keys(data[0]);
    setMapping(detected);
    setColumns(cols);
  };

  const handleMappingConfirmed = (confirmedMapping) => {
    const mapped = applyMapping(rawColombia, confirmedMapping);
    setColombaData(mapped);
    setMappingConfirmed(true);
  };

  const handleExport = async () => {
    try {
      setGenerating(true);
      setSuccess(false);
      await new Promise((res) => setTimeout(res, 300));
      generateExcel(luminateData, colombiaData);
      setSuccess(true);
    } catch (err) {
      console.error("Error generando Excel:", err);
      alert("Ocurrió un error al generar el archivo. Revisa la consola.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-1">Subir archivos</h2>
        <p className="text-gray-400 text-sm">
          Sube los dos archivos para generar el Hot 100 con fórmulas
        </p>
      </div>

      {/* Luminate */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-6 h-6 rounded-md bg-green-500 bg-opacity-20 flex items-center justify-center">
            <span className="text-green-400 text-xs font-bold">L</span>
          </div>
          <h3 className="text-white font-semibold">Archivo Luminate</h3>
        </div>
        <DropZone onDataLoaded={setLuminateData} inputId="luminate-input" />
        {luminateData && (
          <p className="text-sm text-green-400 mt-3">
            ✓ {luminateData.length} filas cargadas
          </p>
        )}
        <DataPreview data={luminateData} />
      </div>

      {/* Colombia Radio */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-6 h-6 rounded-md bg-blue-500 bg-opacity-20 flex items-center justify-center">
            <span className="text-blue-400 text-xs font-bold">C</span>
          </div>
          <h3 className="text-white font-semibold">Archivo Colombia Radio</h3>
        </div>
        <DropZone onDataLoaded={handleColombiLoaded} inputId="colombia-input" />

        {rawColombia && !mappingConfirmed && mapping && (
          <div className="mt-4">
            <ColumnMapper
              mapping={mapping}
              columns={columns}
              onConfirm={handleMappingConfirmed}
            />
          </div>
        )}

        {mappingConfirmed && colombiaData && (
          <p className="text-sm text-green-400 mt-3">
            ✓ {colombiaData.length} filas cargadas y columnas confirmadas
          </p>
        )}
      </div>

      {/* Saltar al paso 2 */}
      <button
        onClick={() => navigate("/step2")}
        className="w-full bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-400 font-semibold py-3 px-6 rounded-2xl transition-all text-sm"
      >
        Ya tengo el Hot 100.xlsx → ir al Paso 2
      </button>

      {/* Exportar */}
      {canExport && (
        <div className="flex flex-col gap-3">
          <button
            onClick={handleExport}
            disabled={generating}
            className={`w-full font-semibold py-4 px-6 rounded-2xl transition-all text-lg ${
              generating
                ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                : "bg-green-500 hover:bg-green-400 text-gray-950"
            }`}
          >
            {generating ? "⏳ Generando..." : "⬇ Generar Hot 100.xlsx"}
          </button>

          {success && (
            <div className="bg-gray-900 border border-green-800 rounded-2xl p-4 flex flex-col gap-3">
              <p className="text-green-400 font-medium text-sm">
                ✓ Archivo generado — ábrelo en Excel, guárdalo y continúa
              </p>
              <button
                onClick={() => navigate("/step2")}
                className="w-full bg-gray-800 hover:bg-gray-700 text-white font-semibold py-3 px-6 rounded-xl transition-all text-sm"
              >
                Continuar al paso 2 →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
