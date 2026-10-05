import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Row = Record<string, string>;

const get = (r: Row, ...keys: string[]) => {
  for (const k of keys) if (r[k] !== undefined && r[k] !== "") return r[k].trim();
  return "";
};

const normalizeHeader = (value: string) =>
  value.trim().toLowerCase().replace(/^\ufeff/, "").replace(/[\s-]+/g, "_");

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
  const headers = rows[0].map(normalizeHeader);
  return rows.slice(1).map(cells => Object.fromEntries(headers.map((h, i) => [h, (cells[i] ?? "").trim()])));
}

const dateOrNull = (value: string) => {
  if (!value) return new Date();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const numberOrUndefined = (value: string) => {
  if (!value) return undefined;
  const normalized = value.replace(/,/g, "").replace(/\s/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : undefined;
};

function detectMt5(row: Row) {
  return Boolean(
    get(row, "deal", "deal_id", "ticket") &&
    get(row, "symbol", "instrument") &&
    (get(row, "type") || get(row, "entry"))
  );
}

function isMt5Exit(row: Row) {
  const entry = get(row, "entry", "deal_entry", "entry_type").toLowerCase();
  return ["out", "out_by", "close", "closed", "exit"].includes(entry) ||
    ["sell", "buy"].includes(get(row, "type").toLowerCase()) && Boolean(get(row, "position_id", "position"));
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const accountId = String(form.get("accountId") ?? "");
    const requestedSource = String(form.get("source") ?? "CSV").toUpperCase();
    const file = form.get("file");

    if (!accountId || !(file instanceof File)) {
      return NextResponse.json({ error: "accountId and CSV file are required" }, { status: 400 });
    }

    if (!["CSV", "MT5"].includes(requestedSource)) {
      return NextResponse.json({ error: "Unsupported import source" }, { status: 400 });
    }

    const rows = parseCsv(await file.text());
    if (!rows.length) return NextResponse.json({ error: "The CSV file contains no data rows" }, { status: 400 });

    const mt5 = requestedSource === "MT5" || rows.some(detectMt5);
    const invalid: number[] = [];
    const skipped: number[] = [];

    const data = rows.flatMap((r, index) => {
      const symbol = get(r, "symbol", "instrument", "pair").toUpperCase();
      const rawType = get(r, "side", "direction", "type").toLowerCase();
      const side = mt5
        ? (rawType.includes("sell") ? "LONG" as const : "SHORT" as const)
        : (rawType.includes("sell") || rawType === "short" ? "SHORT" as const : "LONG" as const);

      if (mt5 && !isMt5Exit(r)) {
        skipped.push(index + 2);
        return [];
      }

      const profit = numberOrUndefined(get(r, "profit", "pnl", "profit_loss"));
      const commission = numberOrUndefined(get(r, "commission", "comm"));
      const swap = numberOrUndefined(get(r, "swap"));
      const pnl = mt5
        ? (profit ?? 0) + (commission ?? 0) + (swap ?? 0)
        : profit;
      const closedAt = dateOrNull(get(r, "closed_at", "close_time", "time", "date"));

      if (!symbol || pnl === undefined || !Number.isFinite(pnl) || !closedAt) {
        invalid.push(index + 2);
        return [];
      }

      return [{
        accountId,
        externalId: get(r, "deal", "id", "ticket", "deal_id") || undefined,
        positionId: get(r, "position_id", "position") || undefined,
        symbol,
        side,
        pnl,
        entryPrice: numberOrUndefined(get(r, "entry_price", "entry", "price_open")),
        exitPrice: numberOrUndefined(get(r, "exit_price", "exit", "price_close", "price")),
        volume: numberOrUndefined(get(r, "volume", "lot", "lots")),
        stopLoss: numberOrUndefined(get(r, "stop_loss", "sl")),
        takeProfit: numberOrUndefined(get(r, "take_profit", "tp")),
        strategy: get(r, "strategy", "expert", "expert_advisor") || undefined,
        session: get(r, "session") || undefined,
        notes: get(r, "notes", "comment") || undefined,
        openedAt: dateOrNull(get(r, "opened_at", "open_time")) || undefined,
        closedAt,
        source: mt5 ? "MT5" as const : "CSV" as const
      }];
    });

    const created = data.length
      ? await prisma.trade.createMany({ data, skipDuplicates: true })
      : { count: 0 };

    return NextResponse.json({
      imported: created.count,
      rows: rows.length,
      skipped: skipped.length,
      invalid: invalid.length,
      skippedRows: skipped.slice(0, 20),
      invalidRows: invalid.slice(0, 20),
      source: mt5 ? "MT5" : "CSV"
    });
  } catch {
    return NextResponse.json({ error: "CSV import failed" }, { status: 500 });
  }
}
