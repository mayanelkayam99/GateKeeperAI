import { useCallback, useEffect, useState } from "react";
import { fetchHistory, fetchScanById, submitScan } from "./src/api/client";
import { scanPackage } from "./src/api/scan";
import Header from "./src/components/Header";
import HistoryTable from "./src/components/HistoryTable";
import ScanForm from "./src/components/ScanForm";
import ScanResultCard from "./src/components/ScanResultCard";

// 🌟 ייבוא הרכיבים החדשים שלכן
import PolicyDashboard from "./src/components/PolicyDashboard";
import ScanHistorySidebar from "./src/components/ScanHistorySidebar";

function getErrorMessage(err) {
  if (err.response?.data?.detail) {
    const detail = err.response.data.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail.map((d) => d.msg || JSON.stringify(d)).join("; ");
    }
    return JSON.stringify(detail);
  }
  if (err.message) return err.message;
  return "An unexpected error occurred.";
}

export default function App() {
  const [packageName, setPackageName] = useState("lodash");
  const [version, setVersion] = useState("4.17.20");
  const [ecosystem, setEcosystem] = useState("npm");

  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState(null);
  const [latestResult, setLatestResult] = useState(null);

  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState(null);
  const [focusedResult, setFocusedResult] = useState(null);
  const [focusedLoading, setFocusedLoading] = useState(false);
  const [focusedError, setFocusedError] = useState(null);
  const [requestedScanId, setRequestedScanId] = useState(null);

  // 🌟 סטייט חדש לניהול הטאבים במערכת (צפייה בסורק לעומת ניהול פוליסי)
  const [activeTab, setActiveTab] = useState("viewer");

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const data = await fetchHistory();
      setHistory(Array.isArray(data) ? data : []);
    } catch (err) {
      setHistoryError(getErrorMessage(err));
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Integration smoke-test
  useEffect(() => {
    scanPackage("lodash")
      .then((result) => {
        console.log("[GateKeeper] /api/scan smoke-test result:", result);
      })
      .catch((err) => {
        console.error("[GateKeeper] /api/scan smoke-test failed:", err);
      });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const queryScanId = params.get("scanId");
    if (!queryScanId) {
      setRequestedScanId(null);
      setFocusedResult(null);
      setFocusedError(null);
      setFocusedLoading(false);
      return;
    }

    const parsedScanId = Number.parseInt(queryScanId, 10);
    if (!Number.isFinite(parsedScanId) || parsedScanId <= 0) {
      setRequestedScanId(queryScanId);
      setFocusedResult(null);
      setFocusedError("Invalid scanId in URL.");
      setFocusedLoading(false);
      return;
    }

    setRequestedScanId(String(parsedScanId));
    setFocusedLoading(true);
    setFocusedError(null);

    fetchScanById(parsedScanId)
      .then((data) => {
        setFocusedResult(data);
      })
      .catch((err) => {
        setFocusedError(getErrorMessage(err));
        setFocusedResult(null);
      })
      .finally(() => {
        setFocusedLoading(false);
      });
  }, []);

  const handleScan = async () => {
    setScanLoading(true);
    setScanError(null);
    try {
      const result = await submitScan({
        name: packageName.trim(),
        version: version.trim(),
        ecosystem,
      });
      setLatestResult(result);
      // אם בוצעה סריקה חדשה, ננקה פוקוס קודם כדי להציג את התוצאה העדכנית ביותר
      setFocusedResult(null); 
      setRequestedScanId(result.id ? String(result.id) : null);
      await loadHistory();
    } catch (err) {
      setScanError(getErrorMessage(err));
    } finally {
      setScanLoading(false);
    }
  };

  // 🌟 פונקציה חדשה: מטפלת בלחיצה על סריקה מתוך ה-Sidebar ההיסטורי ומביאה את הנתונים שלה
  const handleSelectScanFromSidebar = async (scanId) => {
    setRequestedScanId(String(scanId));
    setFocusedLoading(true);
    setFocusedError(null);
    setActiveTab("viewer"); // מעביר את המשתמש חזרה לטאב הסריקות במידה והיה בטאב הפוליסי

    try {
      const data = await fetchScanById(scanId);
      setFocusedResult(data);
    } catch (err) {
      setFocusedError(getErrorMessage(err));
      setFocusedResult(null);
    } finally {
      setFocusedLoading(false);
    }
  };

  const resultToShow = focusedResult || latestResult;
  const isDeepLinkedView = focusedResult != null;

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      {/* כותרת עליונה קבועה */}
      <Header />

      {/* 🌟 שינוי מבנה: פריסת Flex רוחבית שמכילה את ה-Sidebar ואת אזור התוכן המרכזי */}
      <div className="flex flex-1 w-full overflow-hidden">
        
        {/* ⬅️ ה-Sidebar ההיסטורי שנוסף משמאל */}
        <ScanHistorySidebar 
          currentScanId={requestedScanId ? Number(requestedScanId) : null} 
          onSelectScan={handleSelectScanFromSidebar} 
        />

        {/* ➡️ אזור התוכן המרכזי שמשתנה לפי הטאב הנבחר */}
        <div className="flex-1 flex flex-col overflow-y-auto">
          
          {/* 🔝 תפריט טאבים עליון למעבר מהיר בין הסורק למסך ה-CISO */}
          <div className="border-b border-slate-800 bg-slate-900/50 px-6 py-3 flex gap-4">
            <button
              onClick={() => setActiveTab("viewer")}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
                activeTab === "viewer"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
            >
              📊 Dependency Auditor
            </button>
            <button
              onClick={() => setActiveTab("policy")}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
                activeTab === "policy"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
            >
              🛡️ CISO AI Governance
            </button>
          </div>

          {/* 🎯 רינדור התוכן הדינמי על פי הטאב הנבחר */}
          <main className="w-full max-w-7xl flex-1 space-y-8 px-4 py-8 sm:px-6 lg:px-8 mx-auto">
            
            {activeTab === "policy" ? (
              // 🛡️ מסך ניהול חוקי ה-AI החדש ל-CISO
              <PolicyDashboard />
            ) : (
              // 📊 מסך הסריקות וההיסטוריה המקורי שלכן
              <>
                <div className="grid gap-8 lg:grid-cols-5">
                  {/* טופס הרצת סריקה */}
                  <div className="lg:col-span-2">
                    <ScanForm
                      packageName={packageName}
                      version={version}
                      ecosystem={ecosystem}
                      loading={scanLoading}
                      error={scanError}
                      onPackageNameChange={setPackageName}
                      onVersionChange={setVersion}
                      onEcosystemChange={setEcosystem}
                      onSubmit={handleScan}
                    />
                  </div>

                  {/* כרטיס תוצאות סריקה נוכחית/נבחרת */}
                  <div className="lg:col-span-3">
                    {focusedLoading ? (
                      <div className="panel flex h-full min-h-[280px] flex-col items-center justify-center p-8 text-center bg-slate-900 border border-slate-800 rounded-xl">
                        <p className="text-sm text-slate-500 animate-pulse">Loading secure ledger logs...</p>
                      </div>
                    ) : focusedError ? (
                      <div className="panel flex h-full min-h-[280px] flex-col items-center justify-center p-8 text-center bg-slate-900/50 border border-red-900/30 rounded-xl">
                        <p className="text-sm text-red-400">
                          Could not load scan #{requestedScanId}: {focusedError}
                        </p>
                      </div>
                    ) : resultToShow ? (
                      <div className="space-y-3">
                        {isDeepLinkedView && (
                          <p className="text-xs font-mono uppercase tracking-wider text-indigo-400">
                            🛡️ Inspecting Audit Log: Archive #{resultToShow.id}
                          </p>
                        )}
                        <ScanResultCard result={resultToShow} />
                      </div>
                    ) : (
                      <div className="panel flex h-full min-h-[280px] flex-col items-center justify-center p-8 text-center bg-slate-900 border border-slate-800 rounded-xl">
                        <p className="text-sm text-slate-500">
                          Submit a package scan or select a record from the ledger sidebar to inspect results.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* טבלת ההיסטוריה המקורית בתחתית העמוד */}
                <HistoryTable
                  history={history}
                  loading={historyLoading}
                  error={historyError}
                  onRefresh={loadHistory}
                />
              </>
            )}

          </main>
        </div>
      </div>

      {/* פוטר קבוע */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 text-center text-xs text-slate-600">
        AI Security Gatekeeper · OSV + Groq Llama 3
      </footer>
    </div>
  );
}