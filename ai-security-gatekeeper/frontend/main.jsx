import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App.jsx";
import CisoDashboard from "./src/components/CisoDashboard.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/ciso-dashboard" element={<CisoDashboard />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);