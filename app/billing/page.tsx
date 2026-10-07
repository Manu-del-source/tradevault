"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, CreditCard, ShieldCheck } from "lucide-react";

export default function BillingPage() {
  const [status, setStatus] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/billing/status", { cache: "no-store" }).then(async r => {
      if (r.status === 401) { window.location.href = "/login"; return; }
      setStatus(await r.json());
    }).catch(() => setMessage("Unable to load billing status."));
  }, []);

  async function pay() {
    setBusy(true); setMessage("");
    const r = await fetch("/api/billing/checkout", { method: "POST" });
    const data = await r.json();
    if (!r.ok) { setMessage(data.error ?? "Unable to start payment."); setBusy(false); return; }
    window.location.href = data.url;
  }

  return <main className="authPage billingPage"><div className="authPanel billingPanel">
    <Link href="/dashboard" className="authBack"><ArrowLeft/> Back to dashboard</Link>
    <div className="authMark">T</div>
    <span className="eyebrow">TRADEVAULT PRO</span>
    <h1>{status?.active ? "Your Pro plan is active." : "Unlock TradeVault Pro."}</h1>
    <p>Secure checkout through IntaSend. Kenyan customers can use M-Pesa, with other supported payment methods available through checkout.</p>
    <div className="billingPrice"><strong>KES {Number(status?.priceKes || 1000).toLocaleString()}</strong><span> / 30 days</span></div>
    <div className="priceFeatures billingFeatures">{["Unlimited trade history","Advanced analytics","MT5 / Deriv integrations","Strategy & session analysis","Advanced filters"].map(x => <div key={x}><CheckCircle2/> {x}</div>)}</div>
    {status?.active ? <div className="successMessage"><CheckCircle2/> Pro active until {new Date(status.expiresAt).toLocaleDateString()}.</div> :
      <button className="primary wide billingPay" onClick={pay} disabled={busy}><CreditCard/> {busy ? "Opening secure checkout…" : "Pay with M-Pesa / card"}</button>}
    {message && <div className="authError" style={{marginTop:14}}>{message}</div>}
    <div className="authNote"><ShieldCheck/> TradeVault never receives your M-Pesa PIN or card details.</div>
  </div></main>;
}
