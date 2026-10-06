"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ExternalLink, RefreshCw, ShieldCheck, Plus, Download } from "lucide-react";

type Account = {
  id: string;
  name: string;
  broker: string | null;
  platform: string | null;
  environment: string | null;
  accountId: string | null;
};

export default function DerivConnectPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [mt5Name, setMt5Name] = useState("");
  const [mt5Broker, setMt5Broker] = useState("Deriv");
  const [mt5Login, setMt5Login] = useState("");
  const [mt5Environment, setMt5Environment] = useState<"REAL" | "DEMO">("REAL");
  const [addingMt5, setAddingMt5] = useState(false);
  const [bridgeBusy, setBridgeBusy] = useState(false);
  const [bridgeToken, setBridgeToken] = useState("");

  async function load() {
    const r = await fetch("/api/accounts", { cache: "no-store" });
    if (r.status === 401) { window.location.href = "/login"; return; }
    const data = await r.json();
    setAccounts(data);
    setAccountId((current: string) => current || data[0]?.id || "");
  }

  useEffect(() => { load().catch(() => setMessage("Unable to load your trading accounts.")); }, []);

  async function addMt5() {
    if (!mt5Name.trim() || !mt5Login.trim()) {
      setMessage("Enter an MT5 account name and login ID.");
      return;
    }
    setAddingMt5(true);
    setMessage("");
    const r = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: mt5Name.trim(),
        broker: mt5Broker.trim() || "MT5",
        platform: "MT5",
        environment: mt5Environment,
        accountId: mt5Login.trim(),
        currency: "USD"
      })
    });
    const data = await r.json();
    if (!r.ok) {
      setMessage(data.error ?? "Unable to add MT5 account.");
      setAddingMt5(false);
      return;
    }
    setMt5Name("");
    setMt5Login("");
    await load();
    setAccountId(data.id);
    setMessage("MT5 " + mt5Environment.toLowerCase() + " account added. Import its closed MT5 history from the journal.");
    setAddingMt5(false);
  }

  async function downloadInstaller() {
    if (!accountId) return;
    setBridgeBusy(true); setMessage(""); setBridgeToken("");
    const r = await fetch("/api/mt5/installer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId })
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      setMessage(data.error ?? "Unable to prepare the MT5 installer.");
      setBridgeBusy(false);
      return;
    }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "TradeVault-MT5-Setup.ps1";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setMessage("Installer downloaded. Run it on the Windows computer where MT5 is installed.");
    setBridgeBusy(false);
  }

  async function sync() {
    if (!accountId) return;
    setBusy(true); setMessage("");
    const r = await fetch("/api/deriv/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId })
    });
    const data = await r.json();
    setMessage(r.ok ? "Sync complete: " + data.imported + " new trades imported." : (data.error ?? "Sync failed."));
    setBusy(false);
  }

  return <main className="authPage"><div className="authPanel" style={{maxWidth: 680}}>
    <Link href="/dashboard" className="authBack"><ArrowLeft/> Back to dashboard</Link>
    <div className="authMark">T</div>
    <span className="eyebrow">BROKER CONNECTION</span>
    <h1>Connect your trading accounts securely.</h1>
    <p>Deriv accounts use OAuth. MT5 accounts use the read-only TradeVault Bridge EA. Your broker password never enters TradeVault.</p>

    <div className="card" style={{margin:"24px 0",padding:24}}>
      <label>TradeVault account<select value={accountId} onChange={e=>setAccountId(e.target.value)} style={{marginTop:8}}>{accounts.map(a=><option key={a.id} value={a.id}>
              {a.name}{a.broker==="Deriv" ? " · " + (a.platform ?? "DERIV") + " · " + (a.environment ?? "REAL") : ""}
            </option>)}</select></label>
      <a className="primary wide" href={accountId ? "/api/auth/deriv?accountId="+encodeURIComponent(accountId) : "#"} onClick={e=>{if(!accountId){e.preventDefault();setMessage("Select a TradeVault account first.");} else if(accounts.find(a=>a.id===accountId)?.platform === "MT5"){e.preventDefault();setMessage("MT5 accounts use the TradeVault Bridge below, not Deriv OAuth.");}}} style={{display:"flex",justifyContent:"center",textDecoration:"none",marginTop:16}}>
        <ExternalLink/> Connect with Deriv
      </a>
      {message && <div className="authError" style={{marginTop:16}}>{message}</div>}
    </div>

    <div className="authNote"><ShieldCheck/> OAuth 2.0 + PKCE. Tokens are encrypted at rest and never exposed to the browser.</div>
    <div className="authNote"><CheckCircle2/> TradeVault only imports closed history; it does not place or manage trades.</div>

    {accounts.some(a=>a.broker==="Deriv" && a.platform !== "MT5") && <button className="secondary wide" onClick={sync} disabled={busy || accounts.find(a=>a.id===accountId)?.platform === "MT5"} style={{marginTop:12}}><RefreshCw/> {busy ? "Syncing…" : "Sync connected Deriv history now"}</button>}

    <div className="card" style={{margin:"16px 0 0",padding:24}}>
      <span className="eyebrow">MT5 ACCOUNT</span>
      <h2 style={{marginTop:6}}>Add MT5 account</h2>
      <p style={{margin:"8px 0 16px"}}>Add the MT5 login ID without sharing your MT5 password. The same bridge works with supported MT5 brokers, including Real and Demo accounts.</p>
      <div className="formGrid">
        <label>Broker<input placeholder="Deriv" value={mt5Broker} onChange={e=>setMt5Broker(e.target.value)}/></label>
        <label>Account name<input placeholder="Deriv MT5 Real" value={mt5Name} onChange={e=>setMt5Name(e.target.value)}/></label>
        <label>MT5 login ID<input placeholder="12345678" value={mt5Login} onChange={e=>setMt5Login(e.target.value)}/></label>
        <label>Environment<select value={mt5Environment} onChange={e=>setMt5Environment(e.target.value as "REAL"|"DEMO")}><option value="REAL">Real</option><option value="DEMO">Demo</option></select></label>
      </div>
      <button className="secondary wide" onClick={addMt5} disabled={addingMt5} style={{marginTop:16}}><Plus/> {addingMt5 ? "Adding…" : "Add MT5 account"}</button>
    </div>

    {accounts.find(a=>a.id===accountId)?.platform === "MT5" && <div className="card" style={{margin:"16px 0 0",padding:24}}>
      <span className="eyebrow">MT5 CONNECTION</span>
      <h2 style={{marginTop:6}}>Connect automatically</h2>
      <p style={{margin:"8px 0 16px"}}>TradeVault prepares the bridge for this account. No token copying, MQL5 editing, or API URL configuration is required.</p>
      <button className="primary wide" onClick={downloadInstaller} disabled={bridgeBusy}>
        <Download/> {bridgeBusy ? "Preparing installer…" : "Download MT5 setup"}
      </button>
      <div className="authNote" style={{marginTop:12}}>
        <ShieldCheck/> The setup file is unique to this account. Your MT5 password never enters TradeVault.
      </div>
      <div style={{marginTop:16,fontSize:14,lineHeight:1.6}}>
        <strong>3 steps</strong>
        <ol style={{paddingLeft:20,margin:"8px 0 0"}}>
          <li>Download and run the setup file on the Windows PC with MT5.</li>
          <li>Open MT5 and attach <code>TradeVaultBridge</code> from Navigator → Expert Advisors to any chart.</li>
          <li>Allow the TradeVault connection if MT5 asks for permission.</li>
        </ol>
      </div>
    </div> }

  </div></main>;
}
