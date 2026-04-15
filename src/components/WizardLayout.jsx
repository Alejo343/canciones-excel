import { useNavigate, useLocation } from "react-router-dom";

const steps = [
  { number: 1, label: "Subir archivos", path: "/step1" },
  { number: 2, label: "Resolver zeros", path: "/step2" },
  { number: 3, label: "Reporte", path: "/step3" },
];

export default function WizardLayout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const currentStep = steps.findIndex((s) => s.path === location.pathname) + 1;

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
        <span className="text-sm text-gray-500">
          Colombia · Reporte semanal
        </span>
      </header>

      {/* Wizard steps */}
      <div className="px-8 py-6 border-b border-gray-800">
        <div className="max-w-3xl mx-auto flex items-center gap-0">
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
      <main className="max-w-3xl mx-auto px-8 py-10">{children}</main>
    </div>
  );
}
