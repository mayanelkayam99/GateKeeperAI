import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import App from "./App.jsx";
import RemediationDashboard from "./src/components/RemediationDashboard.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/scan/:scanId" element={<RemediationDashboard />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
