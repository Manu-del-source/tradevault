import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { TradeSide } from "@prisma/client";

const toDate = (value: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const params = new URL(request.url).searchParams;
    const accountId = params.get("accountId");
    if (!accountId) return NextResponse.json({ error: "accountId is required" }, { status: 400 });

    const page = Math.max(1, Number(params.get("page") || "1") || 1);
    const pageSize = Math.min(100, Math.max(10, Number(params.get("pageSize") || "25") || 25));
    const q = params.get("q")?.trim() || "";
    const side = params.get("side");
    const sideFilter: TradeSide | undefined = side === "LONG" || side === "SHORT" ? side : undefined;
    const result = params.get("result");
    const strategy = params.get("strategy");
    const session = params.get("session");
    const dateFrom = toDate(params.get("dateFrom"));
    const dateTo = toDate(params.get("dateTo"));

    const account = await prisma.tradingAccount.findFirst({ where: { id: accountId, userId: user.id }, select: { id: true } });
    if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });
    const where = {
      accountId,
      ...(q ? { OR: [
        { symbol: { contains: q, mode: "insensitive" as const } },
        { strategy: { contains: q, mode: "insensitive" as const } },
        { session: { contains: q, mode: "insensitive" as const } }
      ] } : {}),
      ...(sideFilter ? { side: sideFilter } : {}),
      ...(strategy ? { strategy } : {}),
      ...(session ? { session } : {}),
      ...(result === "WIN" ? { pnl: { gt: 0 } } : result === "LOSS" ? { pnl: { lt: 0 } } : result === "BREAK_EVEN" ? { pnl: 0 } : {}),
      ...((dateFrom || dateTo) ? { closedAt: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } } : {})
    };

    const [trades, total] = await prisma.$transaction([
      prisma.trade.findMany({
        where,
        orderBy: [{ closedAt: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      prisma.trade.count({ where })
    ]);

    return NextResponse.json({ trades, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) });
  } catch {
    return NextResponse.json({ error: "Unable to load trades" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json();
    const accountId = String(body.accountId ?? "");
    const symbol = String(body.symbol ?? "").trim().toUpperCase();
    const pnl = Number(body.pnl);
    if (!accountId || !symbol || !Number.isFinite(pnl)) {
      return NextResponse.json({ error: "accountId, symbol and numeric pnl are required" }, { status: 400 });
    }
    const account = await prisma.tradingAccount.findFirst({ where: { id: accountId, userId: user.id }, select: { id: true } });
    if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });
    const trade = await prisma.trade.create({
      data: {
        accountId, symbol, pnl,
        side: body.side === "SHORT" ? "SHORT" : "LONG",
        strategy: body.strategy ? String(body.strategy) : null,
        session: body.session ? String(body.session) : null,
        notes: body.notes ? String(body.notes) : null,
        entryPrice: body.entryPrice != null && body.entryPrice !== "" ? Number(body.entryPrice) : null,
        exitPrice: body.exitPrice != null && body.exitPrice !== "" ? Number(body.exitPrice) : null,
        volume: body.volume != null && body.volume !== "" ? Number(body.volume) : null,
        stopLoss: body.stopLoss != null && body.stopLoss !== "" ? Number(body.stopLoss) : null,
        takeProfit: body.takeProfit != null && body.takeProfit !== "" ? Number(body.takeProfit) : null,
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
