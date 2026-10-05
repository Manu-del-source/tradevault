"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart3, BookOpen, Bot, ChevronDown, CircleDollarSign, Clock3,
  LayoutDashboard, Plus, Search, Settings, ShieldCheck, Target,
  TrendingDown, TrendingUp, Upload, Wallet, X
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
  contractType: string | null;
  entryPrice: string | number | null;
  exitPrice: string | number | null;
  volume: string | number | null;
  stopLoss: string | number | null;
  takeProfit: string | number | null;
  notes: string | null;
  openedAt: string | null;
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
  const [entryPrice, setEntryPrice] = useState("");
  const [exitPrice, setExitPrice] = useState("");
  const [volume, setVolume] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const [importOpen, setImportOpen] = useState(false);

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
    const response = await fetch("/api/trades?accountId=" + encodeURIComponent(id) + "&pageSize=100", { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to load trades");
    const data = await response.json();
    setTrades(data.trades ?? []);
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
          entryPrice: entryPrice || null,
          exitPrice: exitPrice || null,
          volume: volume || null,
          stopLoss: stopLoss || null,
          takeProfit: takeProfit || null,
          notes: notes || null,
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
      setEntryPrice("");
      setExitPrice("");
      setVolume("");
      setStopLoss("");
      setTakeProfit("");
      setNotes("");
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
          <div className="topActions"><button className="secondary" onClick={() => setImportOpen(true)} disabled={!accountId}><Upload/>Import CSV</button><button className="primary" onClick={() => setModal(true)} disabled={!accountId}><Plus/>Log trade</button></div>
        </header>
        {error && <div className="errorBar">{error}<button onClick={() => setError("")}><X size={15}/></button></div>}
        {loading ? <div className="card full loadingState">Loading account data…</div> :
          active === "Dashboard" ? <Dashboard net={net} winRate={winRate} pf={pf} wins={wins} losses={losses} trades={trades}/> :
          active === "Journal" ? <Journal query={query} setQuery={setQuery} trades={filtered} onAdd={() => setModal(true)} onSelect={setSelectedTrade}/> :
          active === "Analytics" ? <Analytics trades={trades}/> :
          <AIReview trades={trades}/>}
      </section>

      {modal && <div className="overlay"><div className="modal">
        <div className="modalHead"><div><p className="eyebrow">MANUAL ENTRY</p><h2>Log a trade</h2></div><button className="iconBtn" onClick={() => setModal(false)}><X/></button></div>
        <label>Symbol<input autoFocus placeholder="XAUUSD" value={symbol} onChange={e => setSymbol(e.target.value)}/></label>
        <label>Direction<select value={side} onChange={e => setSide(e.target.value as "LONG" | "SHORT")}><option value="LONG">Long</option><option value="SHORT">Short</option></select></label>
        <label>P&amp;L ({account?.currency ?? "USD"})<input type="number" step="0.01" placeholder="250.00" value={pnl} onChange={e => setPnl(e.target.value)}/></label>
        <label>Strategy<input placeholder="Liquidity Sweep + FVG" value={strategy} onChange={e => setStrategy(e.target.value)}/></label>
        <div className="formGrid">
          <label>Entry price<input type="number" step="any" placeholder="2350.50" value={entryPrice} onChange={e => setEntryPrice(e.target.value)}/></label>
          <label>Exit price<input type="number" step="any" placeholder="2364.20" value={exitPrice} onChange={e => setExitPrice(e.target.value)}/></label>
          <label>Volume<input type="number" step="any" placeholder="0.10" value={volume} onChange={e => setVolume(e.target.value)}/></label>
          <label>Stop loss<input type="number" step="any" placeholder="2342.00" value={stopLoss} onChange={e => setStopLoss(e.target.value)}/></label>
          <label>Take profit<input type="number" step="any" placeholder="2365.00" value={takeProfit} onChange={e => setTakeProfit(e.target.value)}/></label>
          <label>Session<select value={session} onChange={e => setSession(e.target.value)}><option value="">Not specified</option><option>Asia</option><option>London</option><option>New York</option></select></label>
        </div>
        <label>Notes<textarea placeholder="What happened on this trade?" value={notes} onChange={e => setNotes(e.target.value)}/></label>
        <button className="primary wide" onClick={addTrade} disabled={saving}>{saving ? "Saving…" : "Save trade"}</button>
      </div></div>}
      {importOpen && <CsvImport accountId={accountId} onClose={() => setImportOpen(false)} onImported={async () => { setImportOpen(false); await loadTrades(accountId); }}/>}
      {selectedTrade && <TradeDrawer trade={selectedTrade} onClose={() => setSelectedTrade(null)} onSaved={trade => { setTrades(current => current.map(t => t.id === trade.id ? trade : t)); setSelectedTrade(trade); }} onDeleted={id => { setTrades(current => current.filter(t => t.id !== id)); setSelectedTrade(null); }}/>}
    </main>
  );
}

function CsvImport({accountId,onClose,onImported}:{accountId:string;onClose:()=>void;onImported:()=>Promise<void>}) {
  const [source,setSource]=useState<"CSV"|"MT5"|"DERIV">("CSV");
  const [file,setFile]=useState<File|null>(null);
  const [rows,setRows]=useState<Record<string,string>[]>([]);
  const [headers,setHeaders]=useState<string[]>([]);
  const [errors,setErrors]=useState<string[]>([]);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");

  function parse(text:string) {
    const lines=text.split(/\r?\n/).filter(Boolean);
    if(lines.length<2) return {headers:[],rows:[]};
    const hs=lines[0].split(",").map(h=>h.trim());
    return {headers:hs,rows:lines.slice(1,101).map(line=>{const cells=line.split(",");return Object.fromEntries(hs.map((h,i)=>[h,cells[i]?.trim()??""]));})};
  }
  async function choose(f:File|null) {
    setFile(f); setErrors([]); setMessage("");
    if(!f) {setRows([]);setHeaders([]);return;}
    const parsed=parse(await f.text());
    setHeaders(parsed.headers); setRows(parsed.rows);
    const missing=[];
    const lower=parsed.headers.map(h=>h.toLowerCase().replace(/[\\s-]+/g,"_"));
    if(source==="DERIV") {
      if(!["contract_id","contractid"].some(k=>lower.includes(k))) missing.push("contract_id (JSON import does not use CSV preview)");
    } else if(!["symbol","instrument","pair"].some(k=>lower.includes(k))) missing.push("symbol / instrument / pair");
    if(source==="MT5") {
      if(!["deal","deal_id","ticket"].some(k=>lower.includes(k))) missing.push("deal / deal_id / ticket");
      if(!["time","closed_at","close_time","date"].some(k=>lower.includes(k))) missing.push("time / close_time");
      if(!["type","side","direction"].some(k=>lower.includes(k))) missing.push("type / direction");
    } else if(source==="CSV" && !["pnl","profit","profit_loss"].some(k=>lower.includes(k))) missing.push("pnl / profit / profit_loss");
    setErrors(missing.length ? ["Required columns missing: "+missing.join(", ")] : []);
  }
  async function importFile() {
    if(!file || errors.length) return;
    setBusy(true); setMessage("");
    const form=new FormData(); form.append("accountId",accountId); form.append("source",source); form.append("file",file);
    const endpoint=source==="DERIV" ? "/api/trades/import/deriv" : "/api/trades/import";
    const response=await fetch(endpoint,{method:"POST",body:form});
    const data=await response.json();
    if(!response.ok){setMessage(data.error??"Import failed");setBusy(false);return;}
    setMessage(data.imported+" trades imported from "+data.rows+" "+(source==="DERIV" ? "Deriv contracts" : "CSV rows")+".");
    await onImported(); setBusy(false);
  }
  return <div className="overlay"><div className="modal importModal">
    <div className="modalHead"><div><p className="eyebrow">DATA IMPORT</p><h2>{source==="MT5" ? "Import MT5 history" : source==="DERIV" ? "Import Deriv history" : "Import CSV"}</h2></div><button className="iconBtn" onClick={onClose}><X/></button></div>
    <label>Source<select value={source} onChange={e=>{setSource(e.target.value as "CSV"|"MT5"|"DERIV");setFile(null);setRows([]);setHeaders([]);setErrors([]);setMessage("");}}><option value="CSV">Generic CSV</option><option value="MT5">MetaTrader 5</option><option value="DERIV">Deriv JSON</option></select></label>
    <label className="fileDrop"><Upload/><span><b>{file?.name ?? (source==="DERIV" ? "Choose a Deriv JSON file" : "Choose a CSV file")}</b><small>{source==="MT5" ? "MT5 account history · positions are reconciled from opening and closing deals" : source==="DERIV" ? "Export the completed contracts returned by Deriv profit_table as JSON" : "Required: symbol and P&amp;L · optional: direction, volume, strategy, session, notes, date"}</small></span><input type="file" accept={source==="DERIV" ? ".json,application/json" : ".csv,text/csv"} onChange={e=>choose(e.target.files?.[0]??null)}/></label>
    {errors.map(e=><div className="drawerMessage" key={e}>{e}</div>)}
    {headers.length>0 && <><div className="importMeta">{headers.length} columns · previewing {rows.length} rows</div><div className="importPreview"><table><thead><tr>{headers.slice(0,7).map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.slice(0,5).map((r,i)=><tr key={i}>{headers.slice(0,7).map(h=><td key={h}>{r[h]||"—"}</td>)}</tr>)}</tbody></table></div></>}
    {message && <div className="successMessage">{message}</div>}
    <div className="drawerActions"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" onClick={importFile} disabled={!file||errors.length>0||busy}>{busy?"Importing…":"Import trades"}</button></div>
  </div></div>;
}

function Metric({icon: Icon,label,value,detail}:{icon:any;label:string;value:string;detail:string}) {
  return <div className="metric"><div className="metricIcon"><Icon/></div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function Empty({title="No trades yet",text="Log a trade or import account history to populate this view."}:{title?:string;text?:string}) {
  return <div className="emptyState"><b>{title}</b><span>{text}</span></div>;
}

function Dashboard({net,winRate,pf,wins,losses,trades}:{net:number;winRate:number;pf:string;wins:number;losses:number;trades:Trade[]}) {
  const ordered=[...trades].filter(t=>t.closedAt).sort((a,b)=>new Date(a.closedAt!).getTime()-new Date(b.closedAt!).getTime());
  let running=0;
  const equity=ordered.map(t=>{running+=Number(t.pnl)||0;return {id:t.id,value:running,date:t.closedAt!};});
  const max=Math.max(0,...equity.map(p=>p.value));
  const min=Math.min(0,...equity.map(p=>p.value));
  const range=max-min || 1;
  const points=equity.map((p,i)=>({x:equity.length===1?50:(i/(equity.length-1))*100,y:100-((p.value-min)/range)*90}));
  const path=points.map((p,i)=>(i===0?"M":"L")+p.x.toFixed(2)+","+p.y.toFixed(2)).join(" ");
  return <><div className="heroGrid">
    <Metric icon={CircleDollarSign} label="Net P&L" value={money(net)} detail="Across logged trades"/>
    <Metric icon={Target} label="Win rate" value={winRate+"%"} detail={wins+" wins · "+losses+" losses"}/>
    <Metric icon={TrendingUp} label="Profit factor" value={pf} detail="Gross profit ÷ gross loss"/>
    <Metric icon={Wallet} label="Trades" value={String(trades.length)} detail="Manual / imported journal"/>
  </div>
  <div className="mainGrid">
    <section className="card chartCard"><div className="cardHead"><div><span className="label">EQUITY CURVE</span><h2>{money(net)} <small>net from logged trades</small></h2></div><select><option>All logged trades</option></select></div>
      {equity.length ? <div className="equityChart" aria-label="Equity curve"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><line x1="0" x2="100" y1={100-((0-min)/range)*90} y2={100-((0-min)/range)*90} className="equityZero"/><path d={path} className="equityPath" vectorEffect="non-scaling-stroke"/></svg><div className="equityLabels"><span>{new Date(equity[0].date).toLocaleDateString(undefined,{month:"short",day:"numeric"})}</span><span>{new Date(equity[equity.length-1].date).toLocaleDateString(undefined,{month:"short",day:"numeric"})}</span></div></div> : <div className="chart"><div className="chartEmpty">No dated trades yet.</div></div>}
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

function Journal({query,setQuery,trades,onAdd,onSelect}:{query:string;setQuery:(v:string)=>void;trades:Trade[];onAdd:()=>void;onSelect:(t:Trade)=>void}) {
  const [sideFilter,setSideFilter]=useState("ALL");
  const [resultFilter,setResultFilter]=useState("ALL");
  const [sessionFilter,setSessionFilter]=useState("ALL");
  const [page,setPage]=useState(1);
  const pageSize=15;
  const strategies=[...new Set(trades.map(t=>t.strategy).filter(Boolean))] as string[];
  const filtered=trades.filter(t=>
    (sideFilter==="ALL" || t.side===sideFilter) &&
    (resultFilter==="ALL" || (resultFilter==="WIN" ? Number(t.pnl)>0 : resultFilter==="LOSS" ? Number(t.pnl)<0 : Number(t.pnl)===0)) &&
    (sessionFilter==="ALL" || t.session===sessionFilter)
  );
  const pages=Math.max(1,Math.ceil(filtered.length/pageSize));
  const visible=filtered.slice((page-1)*pageSize,page*pageSize);
  useEffect(()=>setPage(1),[query,sideFilter,resultFilter,sessionFilter]);
  return <section className="card full">
    <div className="journalToolbar">
      <div className="search"><Search/><input placeholder="Search symbols or strategies..." value={query} onChange={e=>setQuery(e.target.value)}/></div>
      <div className="filterRow">
        <select aria-label="Direction filter" value={sideFilter} onChange={e=>setSideFilter(e.target.value)}><option value="ALL">All directions</option><option value="LONG">Long</option><option value="SHORT">Short</option></select>
        <select aria-label="Result filter" value={resultFilter} onChange={e=>setResultFilter(e.target.value)}><option value="ALL">All results</option><option value="WIN">Wins</option><option value="LOSS">Losses</option><option value="BREAK_EVEN">Break-even</option></select>
        <select aria-label="Session filter" value={sessionFilter} onChange={e=>setSessionFilter(e.target.value)}><option value="ALL">All sessions</option><option>Asia</option><option>London</option><option>New York</option></select>
        <button className="secondary" onClick={onAdd}><Plus/>Add trade</button>
      </div>
    </div>
    {visible.length ? <TradeTable trades={visible} onSelect={onSelect}/> : <Empty title={query ? "No matching trades" : "Journal is empty"}/>}
    {filtered.length>0 && <div className="pagination"><span>{(page-1)*pageSize+1}–{Math.min(page*pageSize,filtered.length)} of {filtered.length}</span><div><button disabled={page===1} onClick={()=>setPage(p=>Math.max(1,p-1))}>Previous</button><b>Page {page} / {pages}</b><button disabled={page===pages} onClick={()=>setPage(p=>Math.min(pages,p+1))}>Next</button></div></div>}
  </section>;
}

function TradeTable({trades,onSelect}:{trades:Trade[];onSelect?:(t:Trade)=>void}) {
  return <div className="tableWrap"><table><thead><tr><th>TRADE</th><th>DIRECTION</th><th>P&amp;L</th><th>STRATEGY</th><th>SESSION</th><th>SOURCE</th></tr></thead><tbody>{trades.map(t=><tr key={t.id} onClick={()=>onSelect?.(t)} className={onSelect ? "clickableRow" : ""}><td><b>{t.symbol}</b><small>{t.closedAt ? new Date(t.closedAt).toLocaleDateString() : "Open"}</small></td><td><span className={t.side === "LONG" ? "pill long" : "pill short"}>{t.side === "LONG" ? "Long" : "Short"}</span></td><td className={Number(t.pnl)>=0 ? "profit" : "loss"}>{money(Number(t.pnl))}</td><td>{t.strategy || "—"}</td><td>{t.session || "—"}</td><td>{t.source}</td></tr>)}</tbody></table></div>;
}

function TradeDrawer({trade,onClose,onSaved,onDeleted}:{trade:Trade;onClose:()=>void;onSaved:(t:Trade)=>void;onDeleted:(id:string)=>void}) {
  const [draft,setDraft]=useState(trade);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  async function save(){
    setBusy(true); setMessage("");
    const response=await fetch("/api/trades/"+trade.id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(draft)});
    const data=await response.json();
    if(!response.ok){setMessage(data.error??"Unable to update trade");setBusy(false);return;}
    onSaved(data); setBusy(false);
  }
  async function remove(){
    if(!window.confirm("Delete this trade permanently?")) return;
    setBusy(true);
    const response=await fetch("/api/trades/"+trade.id,{method:"DELETE"});
    if(!response.ok){const data=await response.json();setMessage(data.error??"Unable to delete trade");setBusy(false);return;}
    onDeleted(trade.id);
  }
  return <div className="drawerOverlay"><aside className="drawer">
    <div className="drawerHead"><div><span className="label">TRADE DETAIL</span><h2>{draft.symbol}</h2></div><button className="iconBtn" onClick={onClose}><X/></button></div>
    <div className="drawerGrid">
      <label>Symbol<input value={draft.symbol} onChange={e=>setDraft({...draft,symbol:e.target.value.toUpperCase()})}/></label>
      <label>Direction<select value={draft.side} onChange={e=>setDraft({...draft,side:e.target.value as "LONG"|"SHORT"})}><option value="LONG">Long</option><option value="SHORT">Short</option></select></label>
      <label>P&amp;L<input type="number" step="0.01" value={draft.pnl} onChange={e=>setDraft({...draft,pnl:e.target.value})}/></label>
      <label>Volume<input type="number" step="any" value={draft.volume ?? ""} onChange={e=>setDraft({...draft,volume:e.target.value})}/></label>
      <label>Entry<input type="number" step="any" value={draft.entryPrice ?? ""} onChange={e=>setDraft({...draft,entryPrice:e.target.value})}/></label>
      <label>Exit<input type="number" step="any" value={draft.exitPrice ?? ""} onChange={e=>setDraft({...draft,exitPrice:e.target.value})}/></label>
      <label>Stop loss<input type="number" step="any" value={draft.stopLoss ?? ""} onChange={e=>setDraft({...draft,stopLoss:e.target.value})}/></label>
      <label>Take profit<input type="number" step="any" value={draft.takeProfit ?? ""} onChange={e=>setDraft({...draft,takeProfit:e.target.value})}/></label>
      <label>Strategy<input value={draft.strategy ?? ""} onChange={e=>setDraft({...draft,strategy:e.target.value})}/></label>
      <label>Session<select value={draft.session ?? ""} onChange={e=>setDraft({...draft,session:e.target.value})}><option value="">Not specified</option><option>Asia</option><option>London</option><option>New York</option></select></label>
    </div>
    <label>Notes<textarea value={draft.notes ?? ""} onChange={e=>setDraft({...draft,notes:e.target.value})}/></label>
    {message && <div className="drawerMessage">{message}</div>}
    <div className="drawerActions"><button className="dangerBtn" onClick={remove} disabled={busy}>Delete</button><button className="primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save changes"}</button></div>
  </aside></div>;
}

function Analytics({trades}:{trades:Trade[]}) {
  const names=[...new Set(trades.map(t=>t.strategy).filter(Boolean))] as string[];
  return <div className="analyticsGrid"><section className="card"><span className="label">BY STRATEGY</span>{names.length ? names.map(s=>{const ts=trades.filter(t=>t.strategy===s),p=ts.reduce((a,t)=>a+Number(t.pnl),0);return <div className="analyticRow" key={s}><div><b>{s}</b><small>{ts.length} trades</small></div><strong className={p>=0?"profit":"loss"}>{money(p)}</strong></div>}) : <Empty/>}</section><section className="card"><span className="label">DIRECTIONAL BIAS</span>{trades.length ? <div className="bias">{["LONG","SHORT"].map(side=>{const ts=trades.filter(t=>t.side===side),p=ts.reduce((a,t)=>a+Number(t.pnl),0),pct=Math.round(ts.length/trades.length*100);return <div key={side}>{side==="LONG"?<TrendingUp/>:<TrendingDown/>}<b>{side==="LONG"?"Long":"Short"}</b><strong className={p>=0?"profit":"loss"}>{money(p)}</strong><small>{pct}% of trades · {ts.length} {ts.length===1?"trade":"trades"}</small></div>})}</div> : <Empty/>}</section></div>;
}

function AIReview({trades}:{trades:Trade[]}) {
  return <div className="aiPage"><section className="aiHero"><div className="aiIcon"><Bot/></div><div><span className="label">TRADEVAULT AI</span><h2>Analysis will follow the data.</h2><p>{trades.length} logged trades are available. The review engine will wait for sufficient history before making performance claims.</p></div></section><div className="insightGrid"><Insight title="Current sample" text={trades.length+" trades are available for analysis."}/><Insight title="No fabricated conclusions" text="TradeVault will not label a setup your best strategy without enough evidence."/><Insight title="Next input" text="Import more history or connect a broker data source to deepen the review."/></div></div>;
}

function Insight({title,text}:{title:string;text:string}) { return <div className="card insight"><div className="dot"/><div><b>{title}</b><p>{text}</p></div></div>; }
