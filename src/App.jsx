import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import WizardLayout from "./components/WizardLayout";
import Step1 from "./pages/Step1";
import Step2 from "./pages/Step2";
import Step3 from "./pages/Step3";

export default function App() {
  return (
    <BrowserRouter>
      <WizardLayout>
        <Routes>
          <Route path="/" element={<Navigate to="/step1" replace />} />
          <Route path="/step1" element={<Step1 />} />
          <Route path="/step2" element={<Step2 />} />
          <Route path="/step3" element={<Step3 />} />
        </Routes>
      </WizardLayout>
    </BrowserRouter>
  );
}
