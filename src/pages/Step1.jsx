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
      navigate("/step2");
    } catch (err) {
      console.error("Error generando Excel:", err);
      alert("Ocurrió un error al generar el archivo. Revisa la consola.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="grid grid-cols-[1fr_280px] gap-6 items-start">
      {/* Columna izquierda */}
      <div className="flex flex-col gap-4 min-w-0">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">Subir archivos</h2>
          <p className="text-gray-400 text-sm">
            Sube los dos archivos para generar el Hot 100 con fórmulas
          </p>
        </div>

        {/* Los dos DropZones side by side */}
        <div className="grid grid-cols-2 gap-4">
          {/* Luminate */}
          <div className={`bg-gray-900 border rounded-2xl p-5 flex flex-col gap-3 transition-colors ${luminateData ? "border-green-800" : "border-gray-800"}`}>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-green-500 bg-opacity-20 flex items-center justify-center flex-shrink-0">
                <span className="text-green-400 text-xs font-bold">L</span>
              </div>
              <h3 className="text-white font-semibold text-sm">Archivo Luminate</h3>
              {luminateData && (
                <span className="ml-auto text-xs text-green-400 font-medium">
                  ✓ {luminateData.length} filas
                </span>
              )}
            </div>
            <DropZone onDataLoaded={setLuminateData} inputId="luminate-input" />
          </div>

          {/* Colombia Radio */}
          <div className={`bg-gray-900 border rounded-2xl p-5 flex flex-col gap-3 transition-colors ${mappingConfirmed ? "border-green-800" : rawColombia ? "border-yellow-800" : "border-gray-800"}`}>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-blue-500 bg-opacity-20 flex items-center justify-center flex-shrink-0">
                <span className="text-blue-400 text-xs font-bold">C</span>
              </div>
              <h3 className="text-white font-semibold text-sm">Colombia Radio</h3>
              {mappingConfirmed && colombiaData && (
                <span className="ml-auto text-xs text-green-400 font-medium">
                  ✓ {colombiaData.length} filas
                </span>
              )}
              {rawColombia && !mappingConfirmed && (
                <span className="ml-auto text-xs text-yellow-400 font-medium">
                  Confirmar columnas
                </span>
              )}
            </div>
            <DropZone onDataLoaded={handleColombiLoaded} inputId="colombia-input" />
          </div>
        </div>

        {/* ColumnMapper: ancho completo, aparece debajo de ambos */}
        {rawColombia && !mappingConfirmed && mapping && (
          <div className="bg-gray-900 border border-yellow-800 rounded-2xl p-5">
            <p className="text-yellow-400 text-xs font-semibold uppercase tracking-wider mb-3">
              Confirmar columnas — Colombia Radio
            </p>
            <ColumnMapper
              mapping={mapping}
              columns={columns}
              onConfirm={handleMappingConfirmed}
            />
          </div>
        )}

        {/* DataPreview: altura fija con scroll para no desplazar nada */}
        {(luminateData || (mappingConfirmed && colombiaData)) && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
              <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider">
                Vista previa
              </span>
              <span className="text-gray-600 text-xs">
                {luminateData
                  ? `Luminate · ${luminateData.length} filas`
                  : `Colombia Radio · ${colombiaData?.length} filas`}
              </span>
            </div>
            <div className="max-h-48 overflow-auto">
              <DataPreview data={luminateData ?? colombiaData} />
            </div>
          </div>
        )}
      </div>

      {/* Columna derecha: acciones sticky */}
      <div className="flex flex-col gap-3 sticky top-6">
        {/* Estado */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-col gap-2">
          <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-1">Estado</p>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${luminateData ? "bg-green-400" : "bg-gray-700"}`} />
            <span className={`text-sm ${luminateData ? "text-green-400" : "text-gray-500"}`}>
              {luminateData ? `Luminate — ${luminateData.length} filas` : "Luminate — pendiente"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${mappingConfirmed ? "bg-green-400" : rawColombia ? "bg-yellow-400" : "bg-gray-700"}`} />
            <span className={`text-sm ${mappingConfirmed ? "text-green-400" : rawColombia ? "text-yellow-400" : "text-gray-500"}`}>
              {mappingConfirmed
                ? `Colombia Radio — ${colombiaData?.length} filas`
                : rawColombia
                  ? "Confirmar columnas"
                  : "Colombia Radio — pendiente"}
            </span>
          </div>
        </div>

        {/* Botón exportar */}
        <button
          onClick={handleExport}
          disabled={!canExport || generating}
          className={`w-full font-semibold py-4 px-6 rounded-2xl transition-all text-lg ${
            canExport && !generating
              ? "bg-green-500 hover:bg-green-400 text-gray-950"
              : "bg-gray-700 text-gray-500 cursor-not-allowed"
          }`}
        >
          {generating ? "⏳ Generando..." : "⬇ Generar Hot 100.xlsx"}
        </button>

        {/* Éxito */}
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

        <div className="border-t border-gray-800 pt-3">
          <button
            onClick={() => navigate("/step2")}
            className="w-full bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-400 font-semibold py-3 px-6 rounded-2xl transition-all text-sm"
          >
            Ya tengo el Hot 100.xlsx → Paso 2
          </button>
        </div>
      </div>
    </div>
  );
}
