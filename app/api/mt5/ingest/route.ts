import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function dateFromUnix(value: unknown): Date | null {
  const n = num(value);
  if (n === null) return null;
  const millis = n > 10_000_000_000 ? n : n * 1000;
  const date = new Date(millis);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization") ?? "";
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) return NextResponse.json({ error: "Missing bridge token." }, { status: 401 });

    const tokenHash = hashToken(match[1].trim());
    const credential = await prisma.mt5SyncCredential.findUnique({
      where: { tokenHash },
      include: { account: true }
    });

    if (!credential) return NextResponse.json({ error: "Invalid bridge token." }, { status: 401 });

    const body = await request.json();
    const login = String(body.accountLogin ?? "").trim();
    const symbol = String(body.symbol ?? "").trim();
    const externalId = String(body.dealTicket ?? "").trim();

    if (!login || !symbol || !externalId) {
      return NextResponse.json({ error: "accountLogin, symbol and dealTicket are required." }, { status: 400 });
    }

    if (credential.account.accountId !== login) {
      return NextResponse.json({ error: "MT5 login does not match this TradeVault account." }, { status: 403 });
    }

    if (credential.account.platform !== "MT5") {
      return NextResponse.json({ error: "TradeVault account is not configured for MT5." }, { status: 400 });
    }

    const sideValue = String(body.side ?? "").toUpperCase();
    if (sideValue !== "LONG" && sideValue !== "SHORT") {
      return NextResponse.json({ error: "side must be LONG or SHORT." }, { status: 400 });
    }

    const closedAt = dateFromUnix(body.closedAt);
    if (!closedAt) return NextResponse.json({ error: "closedAt is required." }, { status: 400 });

    const pnl = num(body.pnl);
    if (pnl === null) return NextResponse.json({ error: "pnl is required." }, { status: 400 });

    const openedAt = dateFromUnix(body.openedAt);
    const positionId = body.positionId ? String(body.positionId) : null;

    const trade = await prisma.trade.upsert({
      where: {
        accountId_externalId: {
          accountId: credential.account.id,
          externalId
        }
      },
      create: {
        accountId: credential.account.id,
        externalId,
        positionId,
        symbol,
        side: sideValue as "LONG" | "SHORT",
        pnl,
        entryPrice: num(body.entryPrice),
        exitPrice: num(body.exitPrice),
        volume: num(body.volume),
        stopLoss: num(body.stopLoss),
        takeProfit: num(body.takeProfit),
        strategy: body.comment ? String(body.comment).slice(0, 500) : null,
        openedAt,
        closedAt,
        source: "MT5"
      },
      update: {
        positionId,
        symbol,
        side: sideValue as "LONG" | "SHORT",
        pnl,
        entryPrice: num(body.entryPrice),
        exitPrice: num(body.exitPrice),
        volume: num(body.volume),
        stopLoss: num(body.stopLoss),
        takeProfit: num(body.takeProfit),
        strategy: body.comment ? String(body.comment).slice(0, 500) : null,
        openedAt,
        closedAt,
        source: "MT5"
      }
    });

    await prisma.mt5SyncCredential.update({
      where: { id: credential.id },
      data: { lastUsedAt: new Date() }
    });

    return NextResponse.json({ ok: true, tradeId: trade.id, externalId });
  } catch {
    return NextResponse.json({ error: "Unable to import MT5 trade." }, { status: 500 });
  }
}
