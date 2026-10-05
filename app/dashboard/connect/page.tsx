"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ExternalLink, RefreshCw, ShieldCheck } from "lucide-react";

type Account = { id: string; name: string; broker: string | null; accountId: string | null };

export default function DerivConnectPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    const r = await fetch("/api/accounts", { cache: "no-store" });
    if (r.status === 401) { window.location.href = "/login"; return; }
    const data = await r.json();
    setAccounts(data);
    setAccountId((current: string) => current || data[0]?.id || "");
  }

  useEffect(() => { load().catch(() => setMessage("Unable to load your trading accounts.")); }, []);

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
    <div className="authMark">D</div>
    <span className="eyebrow">BROKER CONNECTION</span>
    <h1>Connect Deriv securely.</h1>
    <p>TradeVault sends you to Deriv to sign in and approve access. Your Deriv password never enters TradeVault.</p>

    <div className="card" style={{margin:"24px 0",padding:24}}>
      <label>TradeVault account<select value={accountId} onChange={e=>setAccountId(e.target.value)} style={{marginTop:8}}>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}{a.broker==="Deriv" ? " · Connected" : ""}</option>)}</select></label>
      <a className="primary wide" href={accountId ? "/api/auth/deriv?accountId="+encodeURIComponent(accountId) : "#"} onClick={e=>{if(!accountId){e.preventDefault();setMessage("Select a TradeVault account first.");}}} style={{display:"flex",justifyContent:"center",textDecoration:"none",marginTop:16}}>
        <ExternalLink/> Connect with Deriv
      </a>
      {message && <div className="authError" style={{marginTop:16}}>{message}</div>}
    </div>

    <div className="authNote"><ShieldCheck/> OAuth 2.0 + PKCE. Tokens are encrypted at rest and never exposed to the browser.</div>
    <div className="authNote"><CheckCircle2/> TradeVault only imports closed history; it does not place or manage trades.</div>

    {accounts.some(a=>a.broker==="Deriv") && <button className="secondary wide" onClick={sync} disabled={busy} style={{marginTop:12}}><RefreshCw/> {busy ? "Syncing…" : "Sync connected Deriv history now"}</button>}
  </div></main>;
}
