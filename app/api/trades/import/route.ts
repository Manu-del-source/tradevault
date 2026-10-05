import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Row = Record<string, string>;

const get = (r: Row, ...keys: string[]) => {
  for (const k of keys) if (r[k] !== undefined && r[k] !== "") return r[k].trim();
  return "";
};

function parseCsv(input: string): Row[] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i], next = input[i + 1];
    if (ch === '"' && quoted && next === '"') { cell += '"'; i++; continue; }
    if (ch === '"') { quoted = !quoted; continue; }
    if (ch === "," && !quoted) { row.push(cell); cell = ""; continue; }
    if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && next === "\n") i++;
      row.push(cell); cell = "";
      if (row.some(v => v.trim())) rows.push(row);
      row = []; continue;
    }
    cell += ch;
  }
  if (cell || row.length) { row.push(cell); if (row.some(v => v.trim())) rows.push(row); }
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => h.trim().toLowerCase());
  return rows.slice(1).map(cells => Object.fromEntries(headers.map((h, i) => [h, (cells[i] ?? "").trim()])));
}

const dateOrNull = (value: string) => {
  if (!value) return new Date();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const accountId = String(form.get("accountId") ?? "");
    const file = form.get("file");
    if (!accountId || !(file instanceof File)) return NextResponse.json({ error: "accountId and CSV file are required" }, { status: 400 });

    const rows = parseCsv(await file.text());
    const invalid: number[] = [];
    const data = rows.flatMap((r, index) => {
      const symbol = get(r, "symbol", "instrument", "pair").toUpperCase();
      const pnl = Number(get(r, "pnl", "profit", "profit_loss"));
      const closedAt = dateOrNull(get(r, "closed_at", "close_time", "date"));
      if (!symbol || !Number.isFinite(pnl) || !closedAt) { invalid.push(index + 2); return []; }
      return [{
        accountId,
        externalId: get(r, "id", "ticket", "deal_id") || undefined,
        symbol,
        side: get(r, "side", "direction").toLowerCase() === "short" ? "SHORT" as const : "LONG" as const,
        pnl,
        entryPrice: Number(get(r, "entry_price", "entry")) || undefined,
        exitPrice: Number(get(r, "exit_price", "exit")) || undefined,
        volume: Number(get(r, "volume", "lot", "lots")) || undefined,
        stopLoss: Number(get(r, "stop_loss", "sl")) || undefined,
        takeProfit: Number(get(r, "take_profit", "tp")) || undefined,
        strategy: get(r, "strategy") || undefined,
        session: get(r, "session") || undefined,
        notes: get(r, "notes", "comment") || undefined,
        closedAt,
        source: "CSV" as const
      }];
    });
    const created = data.length ? await prisma.trade.createMany({ data, skipDuplicates: true }) : { count: 0 };
    return NextResponse.json({ imported: created.count, rows: rows.length, skipped: invalid.length, invalidRows: invalid.slice(0, 20) });
  } catch {
    return NextResponse.json({ error: "CSV import failed" }, { status: 500 });
  }
}
