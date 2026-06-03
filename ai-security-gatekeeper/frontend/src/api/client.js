import axios from "axios";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
    "ngrok-skip-browser-warning": "69420",
  },
  timeout: 120000,
});

export async function submitScan({ name, version, ecosystem }) {
  const { data } = await api.post("/api/scan/", {
    name,
    version,
    ecosystem,
  });
  return data;
}

export async function fetchHistory() {
  const { data } = await api.get("/api/history/");
  return data;
}

export async function fetchScanById(scanId) {
  const { data } = await api.get(`/api/history/${scanId}`);
  return data;
}

export async function fetchRemediationScan(scanId) {
  const { data } = await api.get(`/api/scan/${scanId}`);
  return data;
}

export const chatMessage = (scanId, message, history) =>
  fetch(`${API_BASE_URL}/api/chat/`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "69420",
    },
    body: JSON.stringify({ scan_id: scanId, message, history }),
  });
