import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from "../api/client";

export default function ScanHistorySidebar({ currentScanId, onSelectScan }) {
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // שליפת היסטוריית הסריקות מה-Backend
    fetch(`${API_BASE_URL}/api/history/`, {
      headers: {
        "ngrok-skip-browser-warning": "69420",
      },
    })
      .then((res) => res.json())
      .then((data) => {
        setScans(Array.isArray(data) ? data : []);
      })
      .catch((err) => console.error("Error loading scan history:", err))
      .finally(() => setLoading(false));
  }, [currentScanId]); // רענון אוטומטי אם סריקה חדשה בוצעה

  return (
    <div className="w-64 h-full bg-slate-950 border-r border-slate-800 text-slate-200 flex flex-col font-sans">
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <h3 className="font-semibold text-sm tracking-wider uppercase text-slate-400 flex items-center gap-2">
          📊 Audit History
        </h3>
        <span className="bg-slate-800 text-slate-400 text-xs px-2 py-0.5 rounded-full font-mono">
          {scans.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading ? (
          <div className="p-4 text-center text-xs text-slate-500 animate-pulse">
            Querying ledger logs...
          </div>
        ) : scans.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-500">
            No dynamic scans captured yet.
          </div>
        ) : (
          scans.map((scan) => {
            const isSelected = currentScanId === scan.id;
            const isBlocked = scan.status === 'BLOCKED' || scan.vulnerabilities_count > 0;

            return (
              <button
                key={scan.id}
                onClick={() => onSelectScan(scan.id)}
                className={`w-full text-left p-3 rounded-lg transition-all flex flex-col gap-1 text-xs border ${isSelected
                    ? 'bg-slate-900 border-indigo-500 shadow-md'
                    : 'bg-transparent border-transparent hover:bg-slate-900/50 hover:border-slate-800'
                  }`}
              >
                <div className="flex items-center justify-between font-mono">
                  <span className={`font-bold ${isSelected ? 'text-indigo-400' : 'text-slate-300'}`}>
                    Commit #{scan.id}
                  </span>
                  <span className={`inline-block w-2 h-2 rounded-full ${isBlocked ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'}`} />
                </div>

                <div className="flex justify-between items-center text-[10px] text-slate-500">
                  <span>{new Date(scan.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  <span className={isBlocked ? 'text-rose-400/80' : 'text-emerald-400/80'}>
                    {isBlocked ? 'BLOCKED' : 'APPROVED'}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}