import Link from "next/link";
import { ArrowRight, BarChart3, Database, FileSpreadsheet, ShieldCheck, SlidersHorizontal, TrendingUp, WalletCards } from "lucide-react";

export default function LandingPage() {
  return (
    <main className="landing">
      <nav className="landingNav">
        <Link href="/" className="landingBrand">
          <span className="brandMark">T</span>
          <span><b>TradeVault</b><small>TRADING JOURNAL</small></span>
        </Link>
        <div className="landingLinks">
          <a href="#features">Features</a>
          <a href="#workflow">How it works</a>
          <a href="#pricing">Pricing</a>
          <Link href="/login">Log in</Link>
          <Link href="/signup" className="primary landingCta">Start free<ArrowRight /></Link>
        </div>
      </nav>

      <section className="landingHero">
        <div className="heroCopy">
          <span className="eyebrow">TRADING PERFORMANCE SYSTEM</span>
          <h1>Your trading history.<br /><em>Without the guesswork.</em></h1>
          <p>
            TradeVault brings MT5, Deriv, CSV, and manual trade history into one
            structured journal so you can review what you actually traded,
            how you traded it, and what keeps repeating.
          </p>
          <div className="heroActions">
            <Link href="/signup" className="primary">Start free<ArrowRight /></Link>
            <a href="#product" className="secondary">See the journal</a>
          </div>
          <div className="heroTrust"><ShieldCheck /> Read-only integrations · No trade execution · Built around your history</div>
        </div>

        <div id="product" className="terminalPreview">
          <div className="previewTop"><span><i /> TRADEVAULT / OVERVIEW</span><small>ACCOUNT: PRIMARY</small></div>
          <div className="previewToolbar"><span>Performance</span><span>All history</span><span>USD</span></div>
          <div className="previewMetrics">
            <div><small>NET P&amp;L</small><b>Calculated</b><span>From closed trades</span></div>
            <div><small>WIN RATE</small><b>Calculated</b><span>From trade history</span></div>
            <div><small>PROFIT FACTOR</small><b>Calculated</b><span>From trade history</span></div>
          </div>
          <div className="previewChart">
            <div className="chartGridLines" />
            <div className="chartLine" />
            <div className="chartAxisLabels"><span>Equity</span><span>Trade history</span></div>
          </div>
          <div className="previewRows">
            <div><span>MT5 trade history</span><b>Synced</b></div>
            <div><span>Strategy attribution</span><b>Available</b></div>
            <div><span>Session analysis</span><b>Available</b></div>
          </div>
        </div>
      </section>

      <section className="proofStrip">
        <div><span>DATA SOURCES</span><b>MT5</b><b>DERIV</b><b>CSV</b><b>MANUAL</b></div>
        <p>No execution layer. TradeVault records and analyzes.</p>
      </section>

      <section id="features" className="landingSection">
        <div className="sectionIntro">
          <span className="eyebrow">THE JOURNAL</span>
          <h2>Everything you need to review a trading history.</h2>
          <p>Designed around real trade records, not decorative dashboards or invented performance claims.</p>
        </div>
        <div className="featureGrid">
          <Feature icon={Database} title="Unified history" text="Bring MT5, Deriv, CSV, and manual trades into one account-aware journal." />
          <Feature icon={BarChart3} title="Performance analytics" text="Review P&L, win rate, profit factor, equity progression, sessions, and strategies." />
          <Feature icon={SlidersHorizontal} title="Strategy & session filters" text="Slice your history by symbol, direction, strategy, session, and date." />
          <Feature icon={ShieldCheck} title="Read-only integrations" text="Broker connectors are designed to record history, not place or modify trades." />
          <Feature icon={FileSpreadsheet} title="CSV import" text="Bring existing history into TradeVault without rebuilding your journal from scratch." />
          <Feature icon={TrendingUp} title="Evidence-first review" text="Use patterns supported by your own history instead of generic trading advice." />
        </div>
      </section>

      <section id="workflow" className="workflowSection">
        <div>
          <span className="eyebrow">THE WORKFLOW</span>
          <h2>Connect. Journal. Review.</h2>
          <p className="workflowLead">Start with the history you already have. TradeVault turns it into a structured record you can interrogate over time.</p>
        </div>
        <div className="workflowSteps">
          <Step n="01" t="Connect" d="Create a trading account and import CSV history or connect a read-only source." />
          <Step n="02" t="Journal" d="Keep strategy, session, direction, execution context, and notes alongside the trade." />
          <Step n="03" t="Review" d="Compare results across the dimensions that actually matter to your process." />
        </div>
      </section>

      <section className="securitySection">
        <div className="securityIcon"><ShieldCheck /></div>
        <div><span className="eyebrow">READ-ONLY BY DESIGN</span><h2>Your journal should not trade for you.</h2><p>TradeVault is a performance and journaling system. Broker integrations are for importing history; trade execution stays outside the platform.</p></div>
      </section>

      <section id="pricing" className="pricingSection">
        <div className="sectionIntro">
          <span className="eyebrow">SIMPLE PRICING</span>
          <h2>Start free. Upgrade when you need more.</h2>
          <p>Start with the core journal. Pro adds deeper analytics, unlimited history, and read-only broker integrations.</p>
        </div>
        <div className="pricingGrid">
          <div className="priceBlock"><span className="priceLabel">FREE</span><strong>$0</strong><p>For getting your journal started.</p><div className="priceLine">Manual &amp; CSV history</div><div className="priceLine">Core performance review</div><Link href="/signup" className="secondary priceButton">Start free</Link></div>
          <div className="priceBlock featuredPrice"><span className="priceLabel">PRO</span><strong>$7<span className="pricePeriod"> / month</span></strong><p>For traders who need deeper history and integrations.</p><div className="priceLine">Everything in Free</div><div className="priceLine">Unlimited trade history</div><div className="priceLine">Advanced analytics</div><div className="priceLine">Strategy &amp; session analysis</div><div className="priceLine">MT5 / Deriv integrations</div><div className="priceLine">Advanced filters</div><span className="secondary priceButton">Payments opening soon</span></div>
        </div>
      </section>

      <section className="finalCta">
        <span className="eyebrow">YOUR NEXT REVIEW</span>
        <h2>Stop guessing what your trading is doing.</h2>
        <p>Put the history in one place and start reviewing it properly.</p>
        <Link href="/signup" className="primary">Create your journal<ArrowRight /></Link>
      </section>

      <footer className="landingFooter">
        <span>TradeVault</span><span>Trading performance infrastructure</span>
        <div><Link href="/login">Log in</Link><Link href="/signup">Create account</Link></div>
      </footer>
    </main>
  );
}

function Feature({ icon: Icon, title, text }: { icon: typeof Database; title: string; text: string }) {
  return <article className="feature"><div className="featureIcon"><Icon /></div><h3>{title}</h3><p>{text}</p></article>;
}
function Step({ n, t, d }: { n: string; t: string; d: string }) {
  return <div className="step"><span>{n}</span><div><b>{t}</b><p>{d}</p></div></div>;
}
