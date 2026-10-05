import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Row = Record<string, string>;
const get = (r: Row, ...keys: string[]) => {
  for (const k of keys) if (r[k] !== undefined && r[k] !== "") return r[k].trim();
  return "";
};

function parseCsv(input: string): Row[] {
  const lines = input.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(headers.map((h, i) => [h, (cells[i] ?? "").trim()]));
  });
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const accountId = String(form.get("accountId") ?? "");
    const file = form.get("file");
    if (!accountId || !(file instanceof File)) {
      return NextResponse.json({ error: "accountId and CSV file are required" }, { status: 400 });
    }
    const rows = parseCsv(await file.text());
    const data = rows.flatMap((r) => {
      const symbol = get(r, "symbol", "instrument", "pair").toUpperCase();
      const pnl = Number(get(r, "pnl", "profit", "profit_loss"));
      if (!symbol || !Number.isFinite(pnl)) return [];
      return [{
        accountId,
        externalId: get(r, "id", "ticket", "deal_id") || undefined,
        symbol,
        side: get(r, "side", "direction").toLowerCase() === "short" ? "SHORT" as const : "LONG" as const,
        pnl,
        volume: Number(get(r, "volume", "lot", "lots")) || undefined,
        strategy: get(r, "strategy") || undefined,
        session: get(r, "session") || undefined,
        notes: get(r, "notes", "comment") || undefined,
        closedAt: get(r, "closed_at", "close_time", "date") ? new Date(get(r, "closed_at", "close_time", "date")) : new Date(),
        source: "CSV" as const
      }];
    });
    const created = await prisma.trade.createMany({ data, skipDuplicates: true });
    return NextResponse.json({ imported: created.count, rows: rows.length });
  } catch {
    return NextResponse.json({ error: "CSV import failed" }, { status: 500 });
  }
}
