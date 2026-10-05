import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const accountId = new URL(request.url).searchParams.get("accountId");
  if (!accountId) return NextResponse.json({ error: "accountId is required" }, { status: 400 });
  const trades = await prisma.trade.findMany({ where: { accountId }, orderBy: { closedAt: "desc" }, take: 500 });
  return NextResponse.json(trades);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const accountId = String(body.accountId ?? "");
    const symbol = String(body.symbol ?? "").trim().toUpperCase();
    const pnl = Number(body.pnl);
    if (!accountId || !symbol || !Number.isFinite(pnl)) {
      return NextResponse.json({ error: "accountId, symbol and numeric pnl are required" }, { status: 400 });
    }
    const trade = await prisma.trade.create({
      data: {
        accountId, symbol, pnl,
        side: body.side === "SHORT" ? "SHORT" : "LONG",
        strategy: body.strategy ? String(body.strategy) : null,
        session: body.session ? String(body.session) : null,
        notes: body.notes ? String(body.notes) : null,
        source: "MANUAL",
        openedAt: body.openedAt ? new Date(body.openedAt) : null,
        closedAt: body.closedAt ? new Date(body.closedAt) : new Date()
      }
    });
    return NextResponse.json(trade, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unable to create trade" }, { status: 500 });
  }
}
