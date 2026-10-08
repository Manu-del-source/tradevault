import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasActivePro, isAdmin } from "@/lib/subscription";

type TradeRow = {
  id: string; symbol: string; side: string; pnl: unknown; strategy: string | null;
  session: string | null; closedAt: Date | null; openedAt: Date | null;
  notes: string | null; source: string;
};

function n(v: unknown) { return Number(v) || 0; }
function pct(v: number) { return Math.round(v * 100); }
function money(v: number) { return (v >= 0 ? "+" : "-") + "$" + Math.abs(v).toLocaleString(undefined,{maximumFractionDigits:2}); }

function group(trades: TradeRow[], key: (t: TradeRow) => string) {
  const map = new Map<string, TradeRow[]>();
  for (const t of trades) { const k = key(t) || "Unspecified"; const a = map.get(k) || []; a.push(t); map.set(k,a); }
  return [...map.entries()].map(([name, ts]) => {
    const pnls = ts.map(t=>n(t.pnl)), net = pnls.reduce((a,b)=>a+b,0), wins=pnls.filter(v=>v>0).length;
    const loss=pnls.filter(v=>v<0).length, grossWin=pnls.filter(v=>v>0).reduce((a,b)=>a+b,0), grossLoss=Math.abs(pnls.filter(v=>v<0).reduce((a,b)=>a+b,0));
    return {name,trades:ts.length,net,winRate:ts.length?wins/ts.length:0,profitFactor:grossLoss?grossWin/grossLoss:null,wins,losses:loss};
  }).sort((a,b)=>b.net-a.net);
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({error:"Unauthorized"}, {status:401});
    if (!isAdmin(user) && !(await hasActivePro(user.id))) return NextResponse.json({error:"AI Review is available on TradeVault Pro."},{status:403});

    const accountId = new URL(request.url).searchParams.get("accountId");
    if (!accountId) return NextResponse.json({error:"accountId is required"},{status:400});
    const account = await prisma.tradingAccount.findFirst({where:{id:accountId,userId:user.id},select:{id:true,name:true,currency:true}});
    if (!account) return NextResponse.json({error:"Account not found"},{status:404});

    const trades = await prisma.trade.findMany({
      where:{accountId,closedAt:{not:null}},
      orderBy:{closedAt:"asc"},
      select:{id:true,symbol:true,side:true,pnl:true,strategy:true,session:true,closedAt:true,openedAt:true,notes:true,source:true}
    }) as TradeRow[];

    if (trades.length < 5) return NextResponse.json({
      ready:false, minimumTrades:5, tradesAnalyzed:trades.length,
      message:"Add at least 5 closed trades before generating a meaningful review."
    });

    const pnls=trades.map(t=>n(t.pnl)), net=pnls.reduce((a,b)=>a+b,0);
    const wins=pnls.filter(v=>v>0), losses=pnls.filter(v=>v<0), grossWin=wins.reduce((a,b)=>a+b,0), grossLoss=Math.abs(losses.reduce((a,b)=>a+b,0));
    const winRate=wins.length/trades.length, avgWin=wins.length?grossWin/wins.length:0, avgLoss=losses.length?grossLoss/losses.length:0;
    const pf=grossLoss?grossWin/grossLoss:null, expectancy=net/trades.length;
    let running=0, peak=0, maxDrawdown=0, currentStreak=0, streakType="";
    let bestStreak=0, worstStreak=0;
    for(const p of pnls){ running+=p; peak=Math.max(peak,running); maxDrawdown=Math.max(maxDrawdown,peak-running);
      const type=p>=0?"WIN":"LOSS"; if(type===streakType) currentStreak++; else {streakType=type;currentStreak=1;}
      if(type==="WIN") bestStreak=Math.max(bestStreak,currentStreak); else worstStreak=Math.max(worstStreak,currentStreak);
    }

    const byStrategy=group(trades,t=>t.strategy||"Unspecified");
    const bySession=group(trades,t=>t.session||"Unspecified");
    const bySymbol=group(trades,t=>t.symbol);
    const bySide=group(trades,t=>t.side);
    const bestStrategy=byStrategy.find(x=>x.trades>=2);
    const worstStrategy=[...byStrategy].filter(x=>x.trades>=2).sort((a,b)=>a.net-b.net)[0];
    const bestSession=bySession.find(x=>x.trades>=2);
    const worstSession=[...bySession].filter(x=>x.trades>=2).sort((a,b)=>a.net-b.net)[0];

    let rapidSequences=0, longGaps=0;
    for(let i=1;i<trades.length;i++){
      const a=trades[i-1].closedAt?.getTime(), b=trades[i].openedAt?.getTime() ?? trades[i].closedAt?.getTime();
      if(a && b){ const mins=(b-a)/60000; if(mins>=0 && mins<15) rapidSequences++; if(mins>=240) longGaps++; }
    }

    const insights:{type:"positive"|"warning"|"neutral";title:string;text:string}[]=[];
    if(winRate>=0.55) insights.push({type:"positive",title:"Win-rate edge",text:`You won ${pct(winRate)}% of the ${trades.length} trades reviewed.`});
    else insights.push({type:"warning",title:"Win rate needs work",text:`Win rate is ${pct(winRate)}%. Your average win/loss ratio matters more than win rate alone.`});
    if(pf!==null && pf>=1.5) insights.push({type:"positive",title:"Strong payoff profile",text:`Profit factor is ${pf.toFixed(2)}, meaning gross winners are materially larger than gross losers.`});
    else if(pf!==null && pf<1) insights.push({type:"warning",title:"Losses currently dominate",text:`Profit factor is ${pf.toFixed(2)}. Gross losses exceed gross profits in this sample.`});
    if(bestStrategy) insights.push({type:"positive",title:"Best observed setup",text:`${bestStrategy.name} is your strongest strategy group with ${money(bestStrategy.net)} across ${bestStrategy.trades} trades.`});
    if(worstStrategy && worstStrategy.name!==bestStrategy?.name && worstStrategy.net<0) insights.push({type:"warning",title:"Strategy drag",text:`${worstStrategy.name} is costing ${money(Math.abs(worstStrategy.net))} in the current sample. Review its losing trades before increasing size.`});
    if(bestSession) insights.push({type:"positive",title:"Session strength",text:`${bestSession.name} is the strongest session group at ${money(bestSession.net)}.`});
    if(worstSession && worstSession.net<0 && worstSession.name!==bestSession?.name) insights.push({type:"warning",title:"Session weakness",text:`${worstSession.name} is negative at ${money(worstSession.net)}. Consider reviewing whether those trades match your best setups.`});
    if(maxDrawdown>0) insights.push({type:"warning",title:"Drawdown to respect",text:`The observed peak-to-trough drawdown is ${money(-maxDrawdown)}. Treat this as a review threshold, not a prediction.`});
    if(rapidSequences>=2) insights.push({type:"warning",title:"Fast re-entry pattern",text:`${rapidSequences} trades were opened within 15 minutes of the previous close. Review these sequences for impulsive re-entry or overtrading.`});
    if(rapidSequences===0) insights.push({type:"positive",title:"No rapid re-entry flag",text:"The recorded trade timing does not show repeated sub-15-minute re-entry sequences."});
    if(avgWin>0 && avgLoss>0) insights.push({type:avgWin/avgLoss>=1.5?"positive":"neutral",title:"Payoff ratio",text:`Average winner ${money(avgWin)} versus average loser ${money(-avgLoss)} gives a ${(avgWin/avgLoss).toFixed(2)}:1 payoff ratio.`});

    const confidence=trades.length>=100?"High":trades.length>=30?"Medium":"Early";
    const verdict=net>0 && (pf===null || pf>=1) ? "Your current journal shows a positive performance profile, but the strongest opportunity is to identify which conditions are responsible for it." : "Your current journal does not yet show a durable positive edge. The fastest improvement is to isolate the conditions behind your best and worst trades.";

    return NextResponse.json({
      ready:true, account, tradesAnalyzed:trades.length, confidence,
      summary:{net,winRate,profitFactor:pf,expectancy,avgWin,avgLoss,maxDrawdown,bestStreak,worstStreak},
      verdict, insights,
      breakdown:{strategies:byStrategy.slice(0,8),sessions:bySession.slice(0,6),symbols:bySymbol.slice(0,8),sides:bySide},
      behavior:{rapidSequences,longGaps},
      generatedAt:new Date().toISOString()
    });
  } catch {
    return NextResponse.json({error:"Unable to generate AI review."},{status:500});
  }
}
