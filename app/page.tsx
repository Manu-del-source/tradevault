import Link from "next/link";
import { ArrowRight, BarChart3, Database, ShieldCheck, TrendingUp } from "lucide-react";

export default function LandingPage() {
  return <main className="landing">
    <nav className="landingNav">
      <Link href="/" className="landingBrand"><span className="brandMark">T</span><span><b>TradeVault</b><small>TRADING JOURNAL</small></span></Link>
      <div className="landingLinks"><a href="#features">Features</a><a href="#workflow">How it works</a><Link href="/login">Log in</Link><Link href="/signup" className="primary landingCta">Start free<ArrowRight/></Link></div>
    </nav>
    <section className="landingHero">
      <div className="heroCopy">
        <span className="eyebrow">TRADING PERFORMANCE SYSTEM</span>
        <h1>Your trading history.<br/><em>One source of truth.</em></h1>
        <p>TradeVault turns MT5, Deriv, CSV, and manual trade history into a clean journal built for serious performance review.</p>
        <div className="heroActions"><Link href="/signup" className="primary">Create your journal<ArrowRight/></Link><Link href="/login" className="secondary">Log in</Link></div>
        <div className="heroTrust"><ShieldCheck/> Read-only broker sync · No trade execution · Your data stays in your account</div>
      </div>
      <div className="terminalPreview">
        <div className="previewTop"><span><i/> LIVE JOURNAL</span><small>PERFORMANCE / OVERVIEW</small></div>
        <div className="previewMetrics"><div><small>NET P&amp;L</small><b>+$2,486.40</b></div><div><small>WIN RATE</small><b>68%</b></div><div><small>PROFIT FACTOR</small><b>2.14</b></div></div>
        <div className="previewChart"><div className="chartLine"/></div>
        <div className="previewRows"><div><span>XAUUSD · LONG</span><b>+$284.00</b></div><div><span>EURUSD · SHORT</span><b>+$126.50</b></div><div><span>NAS100 · LONG</span><b className="loss">-$72.00</b></div></div>
      </div>
    </section>
    <section id="features" className="landingSection">
      <div className="sectionIntro"><span className="eyebrow">BUILT FOR THE JOURNAL</span><h2>Useful analytics, without the noise.</h2><p>TradeVault focuses on the information you need to understand execution, consistency, and edge.</p></div>
      <div className="featureGrid"><Feature icon={Database} title="Unified history" text="Bring MT5, Deriv, CSV, and manual trades into one account-aware journal."/><Feature icon={BarChart3} title="Performance analytics" text="Review P&L, win rate, profit factor, sessions, strategies, and equity progression."/><Feature icon={ShieldCheck} title="Read-only integrations" text="Broker connectors are designed to record history, not place or modify trades."/><Feature icon={TrendingUp} title="Evidence first" text="AI review is designed to wait for enough history instead of inventing conclusions."/></div>
    </section>
    <section id="workflow" className="workflowSection"><div><span className="eyebrow">THE WORKFLOW</span><h2>Connect. Journal. Review.</h2></div><div className="workflowSteps"><Step n="01" t="Connect" d="Add an account and import or sync your trading history."/><Step n="02" t="Journal" d="Keep context around strategy, session, direction, and execution."/><Step n="03" t="Review" d="Use evidence from your own history to find repeatable patterns."/></div></section>
    <footer className="landingFooter"><span>TradeVault</span><span>Trading performance infrastructure</span><div><Link href="/login">Log in</Link><Link href="/signup">Create account</Link></div></footer>
  </main>;
}
function Feature({icon:Icon,title,text}:{icon:any;title:string;text:string}){return <article className="feature"><div className="featureIcon"><Icon/></div><h3>{title}</h3><p>{text}</p></article>}
function Step({n,t,d}:{n:string;t:string;d:string}){return <div className="step"><span>{n}</span><div><b>{t}</b><p>{d}</p></div></div>}
