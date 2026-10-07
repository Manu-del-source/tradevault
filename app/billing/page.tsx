"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Copy, ShieldCheck } from "lucide-react";

export default function BillingPage() {
  const [status, setStatus] = useState<any>(null);
  const [payment, setPayment] = useState<{reference:string;tillNumber:string;amount:number} | null>(null);
  const [transactionCode, setTransactionCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function loadStatus() {
    const r = await fetch("/api/billing/status", { cache: "no-store" });
    if (r.status === 401) { window.location.href = "/login"; return; }
    setStatus(await r.json());
  }

  useEffect(() => { loadStatus().catch(() => setMessage("Unable to load billing status.")); }, []);

  async function startPayment() {
    setBusy(true); setMessage("");
    try {
      const r = await fetch("/api/billing/checkout", { method: "POST" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Unable to start payment.");
      setPayment(data);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to start payment.");
    } finally { setBusy(false); }
  }

  async function submitPayment() {
    if (!payment) return;
    setBusy(true); setMessage("");
    try {
      const r = await fetch("/api/billing/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: payment.reference, transactionCode })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Unable to submit payment.");
      setMessage("Payment submitted. We will verify the M-PESA transaction and activate Pro.");
      setTransactionCode("");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to submit payment.");
    } finally { setBusy(false); }
  }

  async function copyTill() {
    if (payment?.tillNumber) await navigator.clipboard?.writeText(payment.tillNumber);
  }

  return <main className="authPage billingPage"><div className="authPanel billingPanel">
    <Link href="/dashboard" className="authBack"><ArrowLeft/> Back to dashboard</Link>
    <div className="authMark">T</div>
    <span className="eyebrow">TRADEVAULT PRO</span>
    <h1>{status?.active ? "Your Pro plan is active." : "Unlock TradeVault Pro."}</h1>
    <p>Pay securely through M-PESA Buy Goods using the TradeVault Till. TradeVault does not receive your M-PESA PIN.</p>
    <div className="billingPrice"><strong>KES {Number(status?.priceKes || 1000).toLocaleString()}</strong><span> / 30 days</span></div>
    <div className="priceFeatures billingFeatures">{["Unlimited trade history","Advanced analytics","MT5 / Deriv integrations","Strategy & session analysis","Advanced filters"].map(x => <div key={x}><CheckCircle2/> {x}</div>)}</div>

    {status?.active ? <div className="successMessage"><CheckCircle2/> Pro active until {new Date(status.expiresAt).toLocaleDateString()}.</div> :
      !payment ? <button className="primary wide billingPay" onClick={startPayment} disabled={busy}>{busy ? "Preparing payment…" : "Show M-PESA payment instructions"}</button> :
      <div className="mpesaPaymentBox">
        <div className="mpesaTill"><div><span className="label">M-PESA TILL NUMBER</span><strong>{payment.tillNumber}</strong></div><button className="secondary" onClick={copyTill}><Copy/> Copy</button></div>
        <p><b>Pay KES {Number(payment.amount).toLocaleString()}</b> using M-PESA → Buy Goods and Services → enter the Till number above.</p>
        <label>M-PESA transaction code<input value={transactionCode} onChange={e => setTransactionCode(e.target.value.toUpperCase())} placeholder="e.g. QGH7ABC123" autoComplete="off"/></label>
        <button className="primary wide" onClick={submitPayment} disabled={busy || !transactionCode.trim()}>{busy ? "Submitting…" : "I have paid — submit transaction"}</button>
        <small>Reference: {payment.reference}</small>
      </div>
    }
    {message && <div className="authError" style={{marginTop:14}}>{message}</div>}
    <div className="authNote"><ShieldCheck/> Payments are manually verified from the business Till before Pro access is activated.</div>
  </div></main>;
}
