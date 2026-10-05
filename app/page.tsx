"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart3, BookOpen, Bot, ChevronDown, CircleDollarSign, Clock3,
  LayoutDashboard, Plus, Search, Settings, ShieldCheck, Target,
  TrendingDown, TrendingUp, Wallet, X
} from "lucide-react";

type Account = { id: string; name: string; broker: string | null; currency: string };
type Trade = {
  id: string;
  symbol: string;
  side: "LONG" | "SHORT";
  pnl: string | number;
  strategy: string | null;
  session: string | null;
  closedAt: string | null;
  source: string;
};

const nav = ["Dashboard", "Journal", "Analytics", "AI Review"];

function money(value: number) {
  return (value >= 0 ? "+" : "-") + "$" + Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function Home() {
  const [active, setActive] = useState("Dashboard");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [trades, setTrades] = useState<Trade[]>([]);
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [symbol, setSymbol] = useState("");
  const [pnl, setPnl] = useState("");
  const [side, setSide] = useState<"LONG" | "SHORT">("LONG");
  const [strategy, setStrategy] = useState("");
  const [session, setSession] = useState("");

  async function loadAccounts() {
    const response = await fetch("/api/accounts");
    if (!response.ok) throw new Error("Unable to load trading accounts");
    const data = await response.json();
    setAccounts(data);
    setAccountId(current => current && data.some((a: Account) => a.id === current) ? current : data[0]?.id ?? "");
    return data as Account[];
  }

  async function loadTrades(id: string) {
    if (!id) {
      setTrades([]);
      return;
    }
    const response = await fetch("/api/trades?accountId=" + encodeURIComponent(id), { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to load trades");
    setTrades(await response.json());
  }

  useEffect(() => {
    loadAccounts()
      .catch(e => setError(e instanceof Error ? e.message : "Unable to load accounts"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!accountId) return;
    loadTrades(accountId).catch(e => setError(e instanceof Error ? e.message : "Unable to load trades"));
  }, [accountId]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return trades.filter(t =>
      t.symbol.toLowerCase().includes(q) ||
      (t.strategy ?? "").toLowerCase().includes(q) ||
      (t.session ?? "").toLowerCase().includes(q)
    );
  }, [trades, query]);

  const values = trades.map(t => Number(t.pnl) || 0);
  const net = values.reduce((a, v) => a + v, 0);
  const wins = values.filter(v => v > 0).length;
  const losses = values.filter(v => v < 0).length;
  const winRate = values.length ? Math.round(wins / values.length * 100) : 0;
  const grossWin = values.filter(v => v > 0).reduce((a, v) => a + v, 0);
  const grossLoss = Math.abs(values.filter(v => v < 0).reduce((a, v) => a + v, 0));
  const pf = grossLoss ? (grossWin / grossLoss).toFixed(2) : "—";
  const account = accounts.find(a => a.id === accountId);

  async function addTrade() {
    if (!accountId || !symbol.trim() || !Number.isFinite(Number(pnl))) {
      setError("Account, symbol and numeric P&L are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          symbol,
          pnl: Number(pnl),
          side,
          strategy: strategy || null,
          session: session || null,
          closedAt: new Date().toISOString()
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to save trade");
      setTrades(current => [data, ...current]);
      setModal(false);
      setSymbol("");
      setPnl("");
      setStrategy("");
      setSession("");
      setSide("LONG");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save trade");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><div className="brandMark">T</div><div><strong>TradeVault</strong><span>TRADING JOURNAL</span></div></div>
        <div className="account">
          <div><span>Account</span><b>{account?.name ?? (loading ? "Loading..." : "No account")}</b></div>
          <ChevronDown size={16}/>
          {accounts.length > 1 && <select aria-label="Select account" value={accountId} onChange={e => setAccountId(e.target.value)}>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>}
        </div>
        <nav>{nav.map(n => <button key={n} className={active === n ? "navItem active" : "navItem"} onClick={() => setActive(n)}>{n === "Dashboard" ? <LayoutDashboard/> : n === "Journal" ? <BookOpen/> : n === "Analytics" ? <BarChart3/> : <Bot/>}{n}</button>)}</nav>
        <div className="sideBottom">
          <button className="navItem"><Settings/>Settings</button>
          <div className="status"><ShieldCheck/><span><b>Journal sync</b>{account?.broker ? "Connected: " + account.broker : "Local account ready"}</span></div>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div><p className="eyebrow">TRADING PERFORMANCE</p><h1>{active}</h1></div>
          <button className="primary" onClick={() => setModal(true)} disabled={!accountId}><Plus/>Log trade</button>
        </header>
        {error && <div className="errorBar">{error}<button onClick={() => setError("")}><X size={15}/></button></div>}
        {loading ? <div className="card full loadingState">Loading account data…</div> :
          active === "Dashboard" ? <Dashboard net={net} winRate={winRate} pf={pf} wins={wins} losses={losses} trades={trades}/> :
          active === "Journal" ? <Journal query={query} setQuery={setQuery} trades={filtered} onAdd={() => setModal(true)}/> :
          active === "Analytics" ? <Analytics trades={trades}/> :
          <AIReview trades={trades}/>}
      </section>

      {modal && <div className="overlay"><div className="modal">
        <div className="modalHead"><div><p className="eyebrow">MANUAL ENTRY</p><h2>Log a trade</h2></div><button className="iconBtn" onClick={() => setModal(false)}><X/></button></div>
        <label>Symbol<input autoFocus placeholder="XAUUSD" value={symbol} onChange={e => setSymbol(e.target.value)}/></label>
        <label>Direction<select value={side} onChange={e => setSide(e.target.value as "LONG" | "SHORT")}><option value="LONG">Long</option><option value="SHORT">Short</option></select></label>
        <label>P&amp;L ({account?.currency ?? "USD"})<input type="number" step="0.01" placeholder="250.00" value={pnl} onChange={e => setPnl(e.target.value)}/></label>
        <label>Strategy<input placeholder="Liquidity Sweep + FVG" value={strategy} onChange={e => setStrategy(e.target.value)}/></label>
        <label>Session<select value={session} onChange={e => setSession(e.target.value)}><option value="">Not specified</option><option>Asia</option><option>London</option><option>New York</option></select></label>
        <button className="primary wide" onClick={addTrade} disabled={saving}>{saving ? "Saving…" : "Save trade"}</button>
      </div></div>}
    </main>
  );
}

function Metric({icon: Icon,label,value,detail}:{icon:any;label:string;value:string;detail:string}) {
  return <div className="metric"><div className="metricIcon"><Icon/></div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function Empty({title="No trades yet",text="Log a trade or import account history to populate this view."}:{title?:string;text?:string}) {
  return <div className="emptyState"><b>{title}</b><span>{text}</span></div>;
}

function Dashboard({net,winRate,pf,wins,losses,trades}:{net:number;winRate:number;pf:string;wins:number;losses:number;trades:Trade[]}) {
  return <><div className="heroGrid">
    <Metric icon={CircleDollarSign} label="Net P&L" value={money(net)} detail="Across logged trades"/>
    <Metric icon={Target} label="Win rate" value={winRate+"%"} detail={wins+" wins · "+losses+" losses"}/>
    <Metric icon={TrendingUp} label="Profit factor" value={pf} detail="Gross profit ÷ gross loss"/>
    <Metric icon={Wallet} label="Trades" value={String(trades.length)} detail="Manual / imported journal"/>
  </div>
  <div className="mainGrid">
    <section className="card chartCard"><div className="cardHead"><div><span className="label">EQUITY CURVE</span><h2>{money(net)} <small>net from logged trades</small></h2></div><select><option>All logged trades</option></select></div>
      {trades.length ? <div className="chart"><div className="chartEmpty">Equity visualization will be added from dated trade history.</div></div> : <div className="chart"><div className="chartEmpty">No equity history yet.</div></div>}
      <div className="chartAxis"><span>First trade</span><span>Current</span></div>
    </section>
    <section className="card"><div className="cardHead"><span className="label">SESSION EDGE</span><Clock3/></div>
      {["London","New York","Asia"].map(session => {const ts=trades.filter(t=>t.session===session),p=ts.reduce((a,t)=>a+Number(t.pnl),0);return <Session key={session} n={session} v={money(p)} p={ts.length+" "+(ts.length===1?"trade":"trades")}/>})}
    </section>
  </div>
  <section className="card recent"><div className="cardHead"><div><span className="label">RECENT TRADES</span><h2>Latest activity</h2></div><span className="muted">{trades.length} trades</span></div>{trades.length ? <TradeTable trades={trades.slice(0,5)}/> : <Empty/>}</section>
  </>;
}

function Session({n,v,p}:{n:string;v:string;p:string}) { return <div className="session"><div><b>{n}</b><span>{v}</span></div><small>{p}</small></div>; }

function Journal({query,setQuery,trades,onAdd}:{query:string;setQuery:(v:string)=>void;trades:Trade[];onAdd:()=>void}) {
  return <section className="card full"><div className="journalToolbar"><div className="search"><Search/><input placeholder="Search symbols or strategies..." value={query} onChange={e=>setQuery(e.target.value)}/></div><button className="secondary" onClick={onAdd}><Plus/>Add trade</button></div>{trades.length ? <TradeTable trades={trades}/> : <Empty title={query ? "No matching trades" : "Journal is empty"}/>}</section>;
}

function TradeTable({trades}:{trades:Trade[]}) {
  return <div className="tableWrap"><table><thead><tr><th>TRADE</th><th>DIRECTION</th><th>P&amp;L</th><th>STRATEGY</th><th>SESSION</th><th>SOURCE</th></tr></thead><tbody>{trades.map(t=><tr key={t.id}><td><b>{t.symbol}</b><small>{t.closedAt ? new Date(t.closedAt).toLocaleDateString() : "Open"}</small></td><td><span className={t.side === "LONG" ? "pill long" : "pill short"}>{t.side === "LONG" ? "Long" : "Short"}</span></td><td className={Number(t.pnl)>=0 ? "profit" : "loss"}>{money(Number(t.pnl))}</td><td>{t.strategy || "—"}</td><td>{t.session || "—"}</td><td>{t.source}</td></tr>)}</tbody></table></div>;
}

function Analytics({trades}:{trades:Trade[]}) {
  const names=[...new Set(trades.map(t=>t.strategy).filter(Boolean))] as string[];
  return <div className="analyticsGrid"><section className="card"><span className="label">BY STRATEGY</span>{names.length ? names.map(s=>{const ts=trades.filter(t=>t.strategy===s),p=ts.reduce((a,t)=>a+Number(t.pnl),0);return <div className="analyticRow" key={s}><div><b>{s}</b><small>{ts.length} trades</small></div><strong className={p>=0?"profit":"loss"}>{money(p)}</strong></div>}) : <Empty/>}</section><section className="card"><span className="label">DIRECTIONAL BIAS</span>{trades.length ? <div className="bias">{["LONG","SHORT"].map(side=>{const ts=trades.filter(t=>t.side===side),p=ts.reduce((a,t)=>a+Number(t.pnl),0),pct=Math.round(ts.length/trades.length*100);return <div key={side}>{side==="LONG"?<TrendingUp/>:<TrendingDown/>}<b>{side==="LONG"?"Long":"Short"}</b><strong className={p>=0?"profit":"loss"}>{money(p)}</strong><small>{pct}% of trades · {ts.length} {ts.length===1?"trade":"trades"}</small></div>})}</div> : <Empty/>}</section></div>;
}

function AIReview({trades}:{trades:Trade[]}) {
  return <div className="aiPage"><section className="aiHero"><div className="aiIcon"><Bot/></div><div><span className="label">TRADEVAULT AI</span><h2>Analysis will follow the data.</h2><p>{trades.length} logged trades are available. The review engine will wait for sufficient history before making performance claims.</p></div></section><div className="insightGrid"><Insight title="Current sample" text={trades.length+" trades are available for analysis."}/><Insight title="No fabricated conclusions" text="TradeVault will not label a setup your best strategy without enough evidence."/><Insight title="Next input" text="Import more history or connect a broker data source to deepen the review."/></div></div>;
}

function Insight({title,text}:{title:string;text:string}) { return <div className="card insight"><div className="dot"/><div><b>{title}</b><p>{text}</p></div></div>; }
