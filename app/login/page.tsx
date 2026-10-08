"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowLeft, ArrowRight, LockKeyhole } from "lucide-react";

export default function LoginPage(){
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);

  async function submit(e:FormEvent){
    e.preventDefault();
    setBusy(true);
    setError("");
    const r=await fetch("/api/auth/login",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({email,password})
    });
    const d=await r.json();
    if(!r.ok){
      setError(d.error??"Unable to sign in");
      setBusy(false);
      return;
    }
    window.location.href="/dashboard";
  }

  return <main className="authPage">
    <div className="authPanel">
      <Link href="/" className="authBack"><ArrowLeft/> TradeVault</Link>
      <div className="authMark">T</div>
      <span className="eyebrow">WELCOME BACK</span>
      <h1>Sign in to your journal.</h1>
      <p>Continue reviewing the trades and performance history in your TradeVault workspace.</p>
      <form onSubmit={submit}>
        <label>Email<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label>
        <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Your password"/></label>
        {error&&<div className="authError">{error}</div>}
        <button className="primary wide" disabled={busy}>{busy?"Signing in…":<>Sign in <ArrowRight/></>}</button>
      </form>
      <div className="authNote"><LockKeyhole/> Your session is secured with an HTTP-only cookie.</div>
      <div className="authSwitch">New to TradeVault? <Link href="/signup">Create an account</Link></div>
    </div>
  </main>
}
