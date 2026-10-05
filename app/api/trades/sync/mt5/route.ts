import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type IncomingTrade = {
  externalId: string;
  positionId?: string | null;
  symbol: string;
  side: "LONG" | "SHORT";
  pnl: number;
  entryPrice?: number | null;
  exitPrice?: number | null;
  volume?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  strategy?: string | null;
  notes?: string | null;
  openedAt?: string | null;
  closedAt?: string | null;
};

const hashToken = (token: string) =>
  createHash("sha256").update(token, "utf8").digest("hex");

const asDate = (value: string | null | undefined) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export async function POST(request: Request) {
  try {
    const auth = request.headers.get("authorization") ?? "";
    const [scheme, token] = auth.split(" ");

    if (scheme !== "Bearer" || !token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const credential = await prisma.mt5SyncCredential.findUnique({
      where: { tokenHash: hashToken(token) },
      select: { id: true, accountId: true }
    });

    if (!credential) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const accountId = String(body.accountId ?? "");
    const trades = Array.isArray(body.trades) ? (body.trades as IncomingTrade[]) : [];

    if (!accountId || !trades.length) {
      return NextResponse.json(
        { error: "accountId and a non-empty trades array are required" },
        { status: 400 }
      );
    }

    // The credential is permanently bound to one TradingAccount.
    // Never allow the caller to use it to write into another account.
    if (accountId !== credential.accountId) {
      return NextResponse.json(
        { error: "Sync credential is not valid for this trading account" },
        { status: 403 }
      );
    }

    const valid = trades.filter(
      (trade) =>
        typeof trade.externalId === "string" &&
        trade.externalId.trim() &&
        typeof trade.symbol === "string" &&
        trade.symbol.trim() &&
        (trade.side === "LONG" || trade.side === "SHORT") &&
        Number.isFinite(Number(trade.pnl))
    );

    let imported = 0;
    for (const trade of valid) {
      await prisma.trade.upsert({
        where: {
          accountId_externalId: {
            accountId,
            externalId: trade.externalId.trim()
          }
        },
        create: {
          accountId,
          externalId: trade.externalId.trim(),
          positionId: trade.positionId ?? null,
          symbol: trade.symbol.trim().toUpperCase(),
          side: trade.side,
          pnl: Number(trade.pnl),
          entryPrice: trade.entryPrice ?? null,
          exitPrice: trade.exitPrice ?? null,
          volume: trade.volume ?? null,
          stopLoss: trade.stopLoss ?? null,
          takeProfit: trade.takeProfit ?? null,
          strategy: trade.strategy ?? null,
          notes: trade.notes ?? null,
          openedAt: asDate(trade.openedAt),
          closedAt: asDate(trade.closedAt),
          source: "MT5"
        },
        update: {
          positionId: trade.positionId ?? null,
          symbol: trade.symbol.trim().toUpperCase(),
          side: trade.side,
          pnl: Number(trade.pnl),
          entryPrice: trade.entryPrice ?? null,
          exitPrice: trade.exitPrice ?? null,
          volume: trade.volume ?? null,
          stopLoss: trade.stopLoss ?? null,
          takeProfit: trade.takeProfit ?? null,
          strategy: trade.strategy ?? null,
          notes: trade.notes ?? null,
          openedAt: asDate(trade.openedAt),
          closedAt: asDate(trade.closedAt),
          source: "MT5"
        }
      });
      imported++;
    }

    await prisma.mt5SyncCredential.update({
      where: { id: credential.id },
      data: { lastUsedAt: new Date() }
    });

    return NextResponse.json({
      ok: true,
      received: trades.length,
      accepted: valid.length,
      synced: imported,
      source: "MT5"
    });
  } catch (error) {
    console.error("MT5 sync failed", error);
    return NextResponse.json({ error: "MT5 sync failed" }, { status: 500 });
  }
}
