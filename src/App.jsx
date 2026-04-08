import { useState } from "react";
import DropZone from "./components/DropZone";
import DataPreview from "./components/DataPreview";
import MatchReport from "./components/MatchReport";
import { generateExcel } from "./utils/generateExcel";
import { resolveZeros } from "./utils/resolveZeros";

export default function App() {
  const [luminateData, setLuminateData] = useState(null);
  const [colombiaData, setColombaData] = useState(null);
  const [calculatedFile, setCalculatedFile] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [step, setStep] = useState(1);
  const [matchReport, setMatchReport] = useState(null);
  const [success, setSuccess] = useState(false);

  const canExport = luminateData && colombiaData;

  const handleExport = async () => {
    try {
      setGenerating(true);
      setSuccess(false);
      await new Promise((res) => setTimeout(res, 300));
      generateExcel(luminateData, colombiaData);
      setStep(2);
      setSuccess(true);
    } catch (err) {
      console.error("Error generando Excel:", err);
      alert("Ocurrió un error al generar el archivo. Revisa la consola.");
    } finally {
      setGenerating(false);
    }
  };

  const handleResolve = async () => {
    try {
      setResolving(true);
      setMatchReport(null);
      const report = await resolveZeros(calculatedFile, colombiaData);
      setMatchReport(report);
    } catch (err) {
      console.error("Error resolviendo zeros:", err);
      alert("Ocurrió un error al procesar el archivo. Revisa la consola.");
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Hot 100</h1>
        <p className="text-gray-500 mb-8">
          Sube los dos archivos para generar el reporte
        </p>

        <div className="flex flex-col gap-6">
          {/* Paso 1 */}
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="bg-gray-800 text-white text-sm font-semibold px-3 py-1 rounded-full">
                Paso 1
              </span>
              <h2 className="text-lg font-semibold text-gray-700">
                Subir archivos y generar Hot 100
              </h2>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <p className="text-sm text-gray-500 mb-2">Archivo Luminate</p>
                <DropZone
                  onDataLoaded={setLuminateData}
                  inputId="luminate-input"
                />
                {luminateData && (
                  <p className="text-sm text-green-600 mt-2">
                    ✓ {luminateData.length} filas cargadas
                  </p>
                )}
                <DataPreview data={luminateData} />
              </div>

              <div>
                <p className="text-sm text-gray-500 mb-2">
                  Archivo Colombia Radio
                </p>
                <DropZone
                  onDataLoaded={setColombaData}
                  inputId="colombia-input"
                />
                {colombiaData && (
                  <p className="text-sm text-green-600 mt-2">
                    ✓ {colombiaData.length} filas cargadas
                  </p>
                )}
              </div>
            </div>

            {canExport && (
              <div className="mt-6">
                <button
                  onClick={handleExport}
                  disabled={generating}
                  className={`w-full font-semibold py-4 px-6 rounded-2xl transition-colors text-lg ${
                    generating
                      ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                      : "bg-gray-800 hover:bg-gray-900 text-white"
                  }`}
                >
                  {generating ? "⏳ Generando..." : "⬇ Generar Hot 100.xlsx"}
                </button>
                {success && (
                  <p className="text-center text-green-600 font-medium mt-3">
                    ✓ Archivo generado — ábrelo en Excel para calcular las
                    fórmulas
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Paso 2 */}
          {step === 2 && (
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <div className="flex items-center gap-3 mb-2">
                <span className="bg-green-600 text-white text-sm font-semibold px-3 py-1 rounded-full">
                  Paso 2
                </span>
                <h2 className="text-lg font-semibold text-gray-700">
                  Subir archivo calculado por Excel
                </h2>
              </div>
              <p className="text-sm text-gray-400 mb-4">
                Abre el archivo en Excel, guárdalo y súbelo aquí para resolver
                los valores en 0
              </p>

              <DropZone
                onDataLoaded={() => {}}
                inputId="calculated-input"
                onFileLoaded={setCalculatedFile}
              />

              {calculatedFile && (
                <div className="mt-4">
                  <p className="text-sm text-green-600 mb-4">
                    ✓ {calculatedFile.name} listo
                  </p>
                  <button
                    onClick={handleResolve}
                    disabled={resolving}
                    className={`w-full font-semibold py-4 px-6 rounded-2xl transition-colors text-lg ${
                      resolving
                        ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                        : "bg-green-600 hover:bg-green-700 text-white"
                    }`}
                  >
                    {resolving
                      ? "⏳ Procesando..."
                      : "⬇ Generar Hot 100 Final.xlsx"}
                  </button>
                </div>
              )}

              <MatchReport report={matchReport} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
