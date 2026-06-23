import { useNavigate, useLocation, Link } from "react-router-dom";
import useStore from "../store/useStore";

const steps = [
  { number: 1, label: "Subir archivos", path: "/step1" },
  { number: 2, label: "Resolver zeros", path: "/step2" },
  { number: 3, label: "Reporte", path: "/step3" },
  { number: 4, label: "Spotify", path: "/step4" },
];

export default function WizardLayout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { reset } = useStore();
  const currentStep = steps.findIndex((s) => s.path === location.pathname) + 1;

  const handleReset = () => {
    if (!confirm("¿Cancelar todo y volver al inicio? Se perderá el progreso actual.")) return;
    reset();
    navigate("/step1");
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center font-bold text-gray-950 text-sm">
            H
          </div>
          <span className="font-bold text-lg tracking-tight">Hot 100</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">Colombia · Reporte semanal</span>
          {currentStep > 1 && (
            <button
              onClick={handleReset}
              className="text-xs text-red-500 hover:text-red-400 transition-colors border border-red-900/60 hover:border-red-700 rounded-lg px-3 py-1.5"
            >
              ✕ Cancelar y empezar de nuevo
            </button>
          )}
          <Link
            to="/admin"
            className="text-xs text-gray-600 hover:text-gray-400 transition-colors border border-gray-800 rounded-lg px-3 py-1.5"
          >
            Admin
          </Link>
        </div>
      </header>

      {/* Wizard steps */}
      <div className="px-8 py-6 border-b border-gray-800">
        <div className="max-w-6xl mx-auto flex items-center gap-0">
          {steps.map((step, i) => (
            <div key={step.number} className="flex items-center flex-1">
              <div
                className="flex items-center gap-3 cursor-pointer"
                onClick={() => navigate(step.path)}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                    currentStep === step.number
                      ? "bg-green-500 text-gray-950"
                      : currentStep > step.number
                        ? "bg-gray-700 text-green-400"
                        : "bg-gray-800 text-gray-500"
                  }`}
                >
                  {currentStep > step.number ? "✓" : step.number}
                </div>
                <span
                  className={`text-sm font-medium transition-all ${
                    currentStep === step.number
                      ? "text-white"
                      : currentStep > step.number
                        ? "text-gray-400"
                        : "text-gray-600"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`flex-1 h-px mx-4 transition-all ${
                    currentStep > step.number ? "bg-green-500" : "bg-gray-800"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-8 py-10">{children}</main>
    </div>
  );
}
