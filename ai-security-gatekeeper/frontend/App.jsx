import { useCallback, useEffect, useState } from "react";
import { fetchHistory, fetchScanById, submitScan } from "./src/api/client";
import { scanPackage } from "./src/api/scan";
import Header from "./src/components/Header";
import HistoryTable from "./src/components/HistoryTable";
import ScanForm from "./src/components/ScanForm";
import ScanResultCard from "./src/components/ScanResultCard";

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

  // Integration smoke-test: call POST /api/scan on mount and log the result.
  // Remove this block once frontend–backend communication is confirmed working.
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
      await loadHistory();
    } catch (err) {
      setScanError(getErrorMessage(err));
    } finally {
      setScanLoading(false);
    }
  };

  const resultToShow = focusedResult || latestResult;
  const isDeepLinkedView = requestedScanId != null;

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="mx-auto w-full max-w-7xl flex-1 space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-5">
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

          <div className="lg:col-span-3">
            {focusedLoading ? (
              <div className="panel flex h-full min-h-[280px] flex-col items-center justify-center p-8 text-center">
                <p className="text-sm text-slate-500">Loading linked scan result...</p>
              </div>
            ) : focusedError ? (
              <div className="panel flex h-full min-h-[280px] flex-col items-center justify-center p-8 text-center">
                <p className="text-sm text-red-300">
                  Could not load scan {requestedScanId}: {focusedError}
                </p>
              </div>
            ) : resultToShow ? (
              <div className="space-y-3">
                {isDeepLinkedView && (
                  <p className="text-xs uppercase tracking-wider text-accent-cyan">
                    Linked security scan #{resultToShow.id}
                  </p>
                )}
                <ScanResultCard result={resultToShow} />
              </div>
            ) : (
              <div className="panel flex h-full min-h-[280px] flex-col items-center justify-center p-8 text-center">
                <p className="text-sm text-slate-500">
                  Submit a package scan to view AI-powered security analysis results here.
                </p>
              </div>
            )}
          </div>
        </div>

        <HistoryTable
          history={history}
          loading={historyLoading}
          error={historyError}
          onRefresh={loadHistory}
        />
      </main>

      <footer className="border-t border-surface-600/40 py-4 text-center text-xs text-slate-600">
        AI Security Gatekeeper · OSV + Groq Llama 3
      </footer>
    </div>
  );
}
