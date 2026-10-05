import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const parseNumber = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const parseDate = (value: unknown) => {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const data: Record<string, unknown> = {};

    if (body.symbol !== undefined) data.symbol = String(body.symbol).trim().toUpperCase();
    if (body.side === "LONG" || body.side === "SHORT") data.side = body.side;
    for (const key of ["entryPrice", "exitPrice", "volume", "stopLoss", "takeProfit"]) {
      if (body[key] !== undefined) data[key] = parseNumber(body[key]);
    }
    if (body.pnl !== undefined) {
      const pnl = parseNumber(body.pnl);
      if (pnl === null) return NextResponse.json({ error: "P&L must be numeric" }, { status: 400 });
      data.pnl = pnl;
    }
    for (const key of ["strategy", "session", "notes"]) {
      if (body[key] !== undefined) data[key] = body[key] ? String(body[key]).trim() : null;
    }
    for (const key of ["openedAt", "closedAt"]) {
      if (body[key] !== undefined) data[key] = parseDate(body[key]);
    }

    const trade = await prisma.trade.update({ where: { id }, data });
    return NextResponse.json(trade);
  } catch {
    return NextResponse.json({ error: "Unable to update trade" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.trade.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unable to delete trade" }, { status: 500 });
  }
}
