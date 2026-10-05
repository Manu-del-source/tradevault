import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Row = Record<string, string>;

const get = (r: Row, ...keys: string[]) => {
  for (const k of keys) {
    if (r[k] !== undefined && r[k] !== "") return r[k].trim();
  }
  return "";
};

const normalizeHeader = (value: string) =>
  value.trim().toLowerCase().replace(/^\ufeff/, "").replace(/[\s-]+/g, "_");

function parseCsv(input: string): Row[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const next = input[i + 1];

    if (ch === '"' && quoted && next === '"') {
      cell += '"';
      i++;
      continue;
    }
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (ch === "," && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }
    if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && next === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      continue;
    }
    cell += ch;
  }

  if (cell || row.length) {
    row.push(cell);
    if (row.some((v) => v.trim())) rows.push(row);
  }

  if (rows.length < 2) return [];

  const headers = rows[0].map(normalizeHeader);
  return rows.slice(1).map((cells) =>
    Object.fromEntries(
      headers.map((header, i) => [header, (cells[i] ?? "").trim()])
    )
  );
}

const dateOrNull = (value: string) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const numberOrUndefined = (value: string) => {
  if (!value) return undefined;
  const normalized = value.replace(/,/g, "").replace(/\s/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : undefined;
};

const mt5Entry = (row: Row) =>
  get(row, "entry", "deal_entry", "entry_type").toLowerCase();

const mt5Type = (row: Row) => get(row, "type").toLowerCase();

const isMt5Entry = (row: Row) =>
  ["in", "entry", "open", "opened"].includes(mt5Entry(row));

const isMt5Exit = (row: Row) =>
  ["out", "out_by", "close", "closed", "exit"].includes(mt5Entry(row));

type Mt5Deal = {
  rowNumber: number;
  positionId: string;
  symbol: string;
  type: string;
  entry: string;
  profit: number;
  commission: number;
  swap: number;
  volume?: number;
  price?: number;
  time: Date | null;
  stopLoss?: number;
  takeProfit?: number;
  strategy?: string;
  comment?: string;
};

function parseMt5Deal(row: Row, rowNumber: number): Mt5Deal | null {
  const positionId = get(row, "position_id", "position");
  const symbol = get(row, "symbol", "instrument").toUpperCase();
  const time = dateOrNull(get(row, "time", "close_time", "date"));

  if (!positionId || !symbol || !time) return null;

  const profit = numberOrUndefined(get(row, "profit", "pnl", "profit_loss"));
  const commission = numberOrUndefined(get(row, "commission", "comm")) ?? 0;
  const swap = numberOrUndefined(get(row, "swap")) ?? 0;

  if (profit === undefined || !Number.isFinite(profit)) return null;

  return {
    rowNumber,
    positionId,
    symbol,
    type: mt5Type(row),
    entry: mt5Entry(row),
    profit,
    commission,
    swap,
    volume: numberOrUndefined(get(row, "volume", "lot", "lots")),
    price: numberOrUndefined(get(row, "price", "price_close", "exit_price")),
    time,
    stopLoss: numberOrUndefined(get(row, "stop_loss", "sl")),
    takeProfit: numberOrUndefined(get(row, "take_profit", "tp")),
    strategy: get(row, "strategy", "expert", "expert_advisor") || undefined,
    comment: get(row, "notes", "comment") || undefined
  };
}

function aggregateMt5Position(deals: Mt5Deal[]) {
  const entries = deals.filter(isMt5Entry);
  const exits = deals.filter(isMt5Exit);

  if (!exits.length) return null;

  // A normal MT5 position has one opening deal. If there are multiple
  // entries/reversals sharing a position id, do not invent an entry price.
  if (entries.length !== 1) return null;

  const entry = entries[0];
  const firstExit = exits.slice().sort((a, b) => a.time!.getTime() - b.time!.getTime());
  const lastExit = firstExit[firstExit.length - 1];

  if (!entry.time || !lastExit.time) return null;

  const side =
    entry.type.includes("sell") ? ("SHORT" as const) : ("LONG" as const);

  const exitWithPrices = exits.filter(
    (deal) => deal.price !== undefined && deal.volume !== undefined && deal.volume > 0
  );

  const totalExitVolume = exitWithPrices.reduce(
    (sum, deal) => sum + (deal.volume ?? 0),
    0
  );

  const weightedExitPrice =
    totalExitVolume > 0
      ? exitWithPrices.reduce(
          (sum, deal) => sum + (deal.price ?? 0) * (deal.volume ?? 0),
          0
        ) / totalExitVolume
      : undefined;

  const pnl = deals.reduce(
    (sum, deal) => sum + deal.profit + deal.commission + deal.swap,
    0
  );

  return {
    externalId: `position:${entry.positionId}`,
    positionId: entry.positionId,
    symbol: entry.symbol,
    side,
    pnl,
    entryPrice: entry.price,
    exitPrice: weightedExitPrice,
    volume: entry.volume ?? (totalExitVolume || undefined),
    stopLoss: entry.stopLoss,
    takeProfit: entry.takeProfit,
    strategy: entry.strategy,
    notes: entry.comment,
    openedAt: entry.time,
    closedAt: lastExit.time,
    dealCount: deals.length,
    exitCount: exits.length,
    rowNumbers: deals.map((deal) => deal.rowNumber)
  };
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const accountId = String(form.get("accountId") ?? "");
    const requestedSource = String(form.get("source") ?? "CSV").toUpperCase();
    const file = form.get("file");

    if (!accountId || !(file instanceof File)) {
      return NextResponse.json(
        { error: "accountId and CSV file are required" },
        { status: 400 }
      );
    }

    if (!["CSV", "MT5"].includes(requestedSource)) {
      return NextResponse.json(
        { error: "Unsupported import source" },
        { status: 400 }
      );
    }

    const rows = parseCsv(await file.text());
    if (!rows.length) {
      return NextResponse.json(
        { error: "The CSV file contains no data rows" },
        { status: 400 }
      );
    }

    // The selected source is authoritative. A generic CSV must never be
    // silently reinterpreted as MT5 just because it has similar columns.
    if (requestedSource === "MT5") {
      const grouped = new Map<string, Mt5Deal[]>();
      const invalidRows: number[] = [];
      const skippedRows: number[] = [];

      rows.forEach((row, index) => {
        const rowNumber = index + 2;
        const entry = mt5Entry(row);
        const positionId = get(row, "position_id", "position");

        if (!positionId) {
          invalidRows.push(rowNumber);
          return;
        }

        const deal = parseMt5Deal(row, rowNumber);
        if (!deal) {
          invalidRows.push(rowNumber);
          return;
        }

        const deals = grouped.get(deal.positionId) ?? [];
        deals.push(deal);
        grouped.set(deal.positionId, deals);

        if (!isMt5Entry(row) && !isMt5Exit(row)) {
          skippedRows.push(rowNumber);
        }
      });

      const aggregated = Array.from(grouped.values())
        .map(aggregateMt5Position)
        .filter((value): value is NonNullable<typeof value> => Boolean(value));

      const complexPositions = Array.from(grouped.values())
        .filter((deals) => {
          const entries = deals.filter(isMt5Entry);
          const exits = deals.filter(isMt5Exit);
          return exits.length > 0 && entries.length !== 1;
        })
        .map((deals) => deals[0].positionId);

      const skippedPositionIds = new Set(
        Array.from(grouped.keys()).filter(
          (positionId) => !aggregated.some((trade) => trade.positionId === positionId)
        )
      );

      const data = aggregated.map((trade) => ({
        accountId,
        externalId: trade.externalId,
        positionId: trade.positionId,
        symbol: trade.symbol,
        side: trade.side,
        pnl: trade.pnl,
        entryPrice: trade.entryPrice,
        exitPrice: trade.exitPrice,
        volume: trade.volume,
        stopLoss: trade.stopLoss,
        takeProfit: trade.takeProfit,
        strategy: trade.strategy,
        notes: trade.notes,
        openedAt: trade.openedAt,
        closedAt: trade.closedAt,
        source: "MT5" as const
      }));

      const created = data.length
        ? await prisma.trade.createMany({ data, skipDuplicates: true })
        : { count: 0 };

      return NextResponse.json({
        imported: created.count,
        positions: grouped.size,
        rows: rows.length,
        skipped: skippedRows.length,
        invalid: invalidRows.length,
        skippedPositions: skippedPositionIds.size,
        complexPositions: complexPositions.length,
        skippedRows: skippedRows.slice(0, 20),
        invalidRows: invalidRows.slice(0, 20),
        source: "MT5"
      });
    }

    const invalid: number[] = [];
    const data = rows.flatMap((row, index) => {
      const symbol = get(row, "symbol", "instrument", "pair").toUpperCase();
      const rawType = get(row, "side", "direction").toLowerCase();
      const side =
        rawType.includes("sell") || rawType === "short"
          ? ("SHORT" as const)
          : ("LONG" as const);

      const pnl = numberOrUndefined(get(row, "pnl", "profit", "profit_loss"));
      const closedAt = dateOrNull(
        get(row, "closed_at", "close_time", "date", "time")
      );

      if (!symbol || pnl === undefined || !Number.isFinite(pnl) || !closedAt) {
        invalid.push(index + 2);
        return [];
      }

      return [
        {
          accountId,
          externalId: get(row, "id", "ticket", "deal_id") || undefined,
          symbol,
          side,
          pnl,
          entryPrice: numberOrUndefined(get(row, "entry_price", "entry")),
          exitPrice: numberOrUndefined(get(row, "exit_price", "exit")),
          volume: numberOrUndefined(get(row, "volume", "lot", "lots")),
          stopLoss: numberOrUndefined(get(row, "stop_loss", "sl")),
          takeProfit: numberOrUndefined(get(row, "take_profit", "tp")),
          strategy: get(row, "strategy") || undefined,
          session: get(row, "session") || undefined,
          notes: get(row, "notes", "comment") || undefined,
          openedAt: dateOrNull(get(row, "opened_at", "open_time")) || undefined,
          closedAt,
          source: "CSV" as const
        }
      ];
    });

    const created = data.length
      ? await prisma.trade.createMany({ data, skipDuplicates: true })
      : { count: 0 };

    return NextResponse.json({
      imported: created.count,
      rows: rows.length,
      skipped: 0,
      invalid: invalid.length,
      skippedRows: [],
      invalidRows: invalid.slice(0, 20),
      source: "CSV"
    });
  } catch {
    return NextResponse.json({ error: "CSV import failed" }, { status: 500 });
  }
}
