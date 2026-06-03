import React, { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export default function PolicyDashboard() {
  const [context, setContext] = useState('');
  const [allowedLicenses, setAllowedLicenses] = useState([]);
  const [blockedLicenses, setBlockedLicenses] = useState([]);
  const [newAllowed, setNewAllowed] = useState('');
  const [newBlocked, setNewBlocked] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch(`${API_BASE}/api/policy`, {
      headers: {
        "ngrok-skip-browser-warning": "69420",
      },
    })
      .then((res) => res.json())
      .then((data) => {
        setContext(data.context || '');
        setAllowedLicenses(data.allowed_licenses || []);
        setBlockedLicenses(data.blocked_licenses || []);
      })
      .catch((err) => console.error("Error fetching policy:", err));
  }, []);

  const handleSave = async () => {
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch(`${API_BASE}/api/policy`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          "ngrok-skip-browser-warning": "69420",
        },
        body: JSON.stringify({
          context: context,
          allowed_licenses: allowedLicenses,
          blocked_licenses: blockedLicenses,
        }),
      });
      if (response.ok) {
        setMessage('✅ Policy updated successfully!');
      } else {
        setMessage('❌ Error updating policy.');
      }
    } catch (error) {
      setMessage('❌ Connection error.');
    } finally {
      setLoading(false);
    }
  };

  const addLicense = (type) => {
    if (type === 'allowed' && newAllowed.trim()) {
      setAllowedLicenses([...allowedLicenses, newAllowed.trim().toUpperCase()]);
      setNewAllowed('');
    } else if (type === 'blocked' && newBlocked.trim()) {
      setBlockedLicenses([...blockedLicenses, newBlocked.trim().toUpperCase()]);
      setNewBlocked('');
    }
  };

  const removeLicense = (type, index) => {
    if (type === 'allowed') {
      setAllowedLicenses(allowedLicenses.filter((_, i) => i !== index));
    } else {
      setBlockedLicenses(blockedLicenses.filter((_, i) => i !== index));
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-8 bg-slate-900 text-slate-100 rounded-xl shadow-2xl border border-slate-800 space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2 flex items-center gap-2 text-indigo-400">
          🛡️ CISO Compliance Policy Gatekeeper
        </h2>
        <p className="text-slate-400 text-sm">Configure AI governance guardrails for dependency scanning.</p>
      </div>

      <div className="w-full">
        <label className="block text-sm font-semibold text-slate-300 mb-2">Company Business & Regulatory Context</label>
        <textarea
          className="w-full min-h-[250px] p-4 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono leading-relaxed shadow-inner transition-all duration-200 focus:border-indigo-500/50"
          placeholder="Describe your architecture, commercial model, security compliance requirements, and specific industry regulations..."
          value={context}
          onChange={(e) => setContext(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
        <div className="p-5 bg-slate-950 border border-slate-800 rounded-lg flex flex-col justify-between h-full min-h-[220px]">
          <div>
            <label className="block text-sm font-semibold text-emerald-400 mb-3">Allowed Licenses (SPDX)</label>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                className="flex-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded text-sm uppercase focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="E.G. MIT"
                value={newAllowed}
                onChange={(e) => setNewAllowed(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addLicense('allowed')}
              />
              <button onClick={() => addLicense('allowed')} className="px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded text-sm font-bold shadow transition-all">+</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {allowedLicenses.map((lic, idx) => (
                <span key={idx} className="inline-flex items-center gap-1.5 bg-emerald-950/40 text-emerald-300 text-xs px-2.5 py-1.5 rounded border border-emerald-800 font-semibold shadow-sm">
                  {lic}
                  <button onClick={() => removeLicense('allowed', idx)} className="text-emerald-500 hover:text-emerald-300 font-bold ml-1 transition-colors">×</button>
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="p-5 bg-slate-950 border border-slate-800 rounded-lg flex flex-col justify-between h-full min-h-[220px]">
          <div>
            <label className="block text-sm font-semibold text-rose-400 mb-3">Blocked Licenses (SPDX)</label>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                className="flex-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded text-sm uppercase focus:outline-none focus:ring-1 focus:ring-rose-500"
                placeholder="E.G. GPL-3.0"
                value={newBlocked}
                onChange={(e) => setNewBlocked(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addLicense('blocked')}
              />
              <button onClick={() => addLicense('blocked')} className="px-4 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white rounded text-sm font-bold shadow transition-all">+</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {blockedLicenses.map((lic, idx) => (
                <span key={idx} className="inline-flex items-center gap-1.5 bg-rose-950/40 text-rose-300 text-xs px-2.5 py-1.5 rounded border border-rose-800 font-semibold shadow-sm">
                  {lic}
                  <button onClick={() => removeLicense('blocked', idx)} className="text-rose-500 hover:text-rose-300 font-bold ml-1 transition-colors">×</button>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-slate-800 pt-5">
        <span className="text-sm font-medium text-indigo-400">{message}</span>
        <button
          onClick={handleSave}
          disabled={loading}
          className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white text-sm font-semibold rounded-lg shadow-lg hover:shadow-indigo-600/10 active:scale-95 transition-all duration-150"
        >
          {loading ? 'Saving...' : 'Apply Dynamic Policy'}
        </button>
      </div>
    </div>
  );
}