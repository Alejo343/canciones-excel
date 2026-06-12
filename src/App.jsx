import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import WizardLayout from "./components/WizardLayout";
import Step1 from "./pages/Step1";
import Step2 from "./pages/Step2";
import Step3 from "./pages/Step3";
import Step4 from "./pages/Step4";
import Admin from "./pages/Admin";
import AdminLogin from "./pages/AdminLogin";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<Admin />} />
        <Route
          path="/*"
          element={
            <WizardLayout>
              <Routes>
                <Route path="/" element={<Navigate to="/step1" replace />} />
                <Route path="/step1" element={<Step1 />} />
                <Route path="/step2" element={<Step2 />} />
                <Route path="/step3" element={<Step3 />} />
                <Route path="/step4" element={<Step4 />} />
              </Routes>
            </WizardLayout>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
