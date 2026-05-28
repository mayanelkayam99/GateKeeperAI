import React, { useState, useEffect } from 'react';

const API_BASE = 'http://localhost:8000';

export default function PolicyDashboard() {
  const [context, setContext] = useState('');
  const [allowedLicenses, setAllowedLicenses] = useState([]);
  const [blockedLicenses, setBlockedLicenses] = useState([]);
  const [newAllowed, setNewAllowed] = useState('');
  const [newBlocked, setNewBlocked] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch(`${API_BASE}/api/policy`)
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
        headers: { 'Content-Type': 'application/json' },
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
    <div className="max-w-4xl mx-auto p-6 bg-slate-900 text-slate-100 rounded-xl shadow-2xl border border-slate-800">
      <h2 className="text-2xl font-bold mb-2 flex items-center gap-2 text-indigo-400">
        🛡️ CISO Compliance Policy Gatekeeper
      </h2>
      <p className="text-slate-400 mb-6 text-sm">Configure AI governance guardrails for dependency scanning.</p>

      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-300 mb-2">Company Business & Regulatory Context</label>
        <textarea
          className="w-full h-28 p-3 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          placeholder="Describe your architecture and commercial model..."
          value={context}
          onChange={(e) => setContext(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg">
          <label className="block text-sm font-medium text-emerald-400 mb-2">Allowed Licenses (SPDX)</label>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded text-sm uppercase"
              placeholder="E.G. MIT"
              value={newAllowed}
              onChange={(e) => setNewAllowed(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addLicense('allowed')}
            />
            <button onClick={() => addLicense('allowed')} className="px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm font-bold">+</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {allowedLicenses.map((lic, idx) => (
              <span key={idx} className="inline-flex items-center gap-1 bg-emerald-950/50 text-emerald-400 text-xs px-2 py-1 rounded border border-emerald-800">
                {lic}
                <button onClick={() => removeLicense('allowed', idx)} className="text-emerald-600 hover:text-emerald-400 font-bold ml-1">×</button>
              </span>
            ))}
          </div>
        </div>

        <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg">
          <label className="block text-sm font-medium text-rose-400 mb-2">Blocked Licenses (SPDX)</label>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded text-sm uppercase"
              placeholder="E.G. GPL-3.0"
              value={newBlocked}
              onChange={(e) => setNewBlocked(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addLicense('blocked')}
            />
            <button onClick={() => addLicense('blocked')} className="px-3 bg-rose-600 hover:bg-rose-700 text-white rounded text-sm font-bold">+</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {blockedLicenses.map((lic, idx) => (
              <span key={idx} className="inline-flex items-center gap-1 bg-rose-950/50 text-rose-400 text-xs px-2 py-1 rounded border border-rose-800">
                {lic}
                <button onClick={() => removeLicense('blocked', idx)} className="text-rose-600 hover:text-rose-400 font-bold ml-1">×</button>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-slate-800 pt-4">
        <span className="text-sm font-medium text-indigo-400">{message}</span>
        <button
          onClick={handleSave}
          disabled={loading}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white text-sm font-semibold rounded-lg shadow-md transition-all"
        >
          {loading ? 'Saving...' : 'Apply Dynamic Policy'}
        </button>
      </div>
    </div>
  );
}