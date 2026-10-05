import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type DerivTransaction = Record<string, unknown>;

const num = (value: unknown) => {
  if (value === null || value === undefined || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const text = (value: unknown) =>
  value === null || value === undefined ? "" : String(value).trim();

const epochDate = (value: unknown) => {
  const n = num(value);
  if (n === undefined) return null;
  const date = new Date(n * 1000);
  return Number.isNaN(date.getTime()) ? null : date;
};

function directionForContract(type: string): "LONG" | "SHORT" {
  const normalized = type.toUpperCase();
  if (
    ["LOWER", "PUT", "PUTE", "MULTDOWN", "TURBOSSHORT", "RUNLOW", "TICKLOW"].includes(normalized)
  ) {
    return "SHORT";
  }
  return "LONG";
}

function getTransactions(payload: unknown): DerivTransaction[] {
  if (Array.isArray(payload)) return payload as DerivTransaction[];

  if (!payload || typeof payload !== "object") return [];

  const root = payload as Record<string, unknown>;
  const profitTable = root.profit_table;

  if (profitTable && typeof profitTable === "object") {
    const transactions = (profitTable as Record<string, unknown>).transactions;
    if (Array.isArray(transactions)) return transactions as DerivTransaction[];
  }

  if (Array.isArray(root.transactions)) {
    return root.transactions as DerivTransaction[];
  }

  return [];
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const accountId = text(form.get("accountId"));
    const file = form.get("file");

    if (!accountId || !(file instanceof File)) {
      return NextResponse.json(
        { error: "accountId and Deriv JSON file are required" },
        { status: 400 }
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(await file.text());
    } catch {
      return NextResponse.json(
        { error: "The Deriv file is not valid JSON" },
        { status: 400 }
      );
    }

    const transactions = getTransactions(payload);
    if (!transactions.length) {
      return NextResponse.json(
        { error: "No Deriv profit_table transactions were found" },
        { status: 400 }
      );
    }

    const invalidRows: number[] = [];
    const data = transactions.flatMap((transaction, index) => {
      const contractId = text(transaction.contract_id);
      const symbol = text(transaction.underlying_symbol).toUpperCase();
      const contractType = text(transaction.contract_type).toUpperCase();
      const buyPrice = num(transaction.buy_price);
      const sellPrice = num(transaction.sell_price);
      const payout = num(transaction.payout);
      const purchaseTime = epochDate(transaction.purchase_time);
      const transactionTime = epochDate(transaction.transaction_time);

      // profit_table represents completed contracts. A settled contract
      // normally has buy_price + sell_price; use payout only when sell_price
      // is unavailable so the import does not silently manufacture P&L.
      const exitValue = sellPrice ?? payout;
      const pnl =
        buyPrice !== undefined && exitValue !== undefined
          ? exitValue - buyPrice
          : undefined;

      if (
        !contractId ||
        !symbol ||
        !contractType ||
        buyPrice === undefined ||
        exitValue === undefined ||
        pnl === undefined ||
        !transactionTime
      ) {
        invalidRows.push(index + 1);
        return [];
      }

      const openedAt = purchaseTime ?? transactionTime;

      return [{
        accountId,
        externalId: `contract:${contractId}`,
        positionId: contractId,
        contractType,
        symbol,
        side: directionForContract(contractType),
        pnl,
        entryPrice: null,
        exitPrice: null,
        volume: null,
        strategy: `Deriv ${contractType}`,
        notes: [
          `Stake: ${buyPrice}`,
          `Return: ${exitValue}`,
          text(transaction.longcode) || text(transaction.shortcode)
        ].filter(Boolean).join(" · ") || null,
        openedAt,
        closedAt: transactionTime,
        source: "DERIV" as const
      }];
    });

    const created = data.length
      ? await prisma.trade.createMany({ data, skipDuplicates: true })
      : { count: 0 };

    return NextResponse.json({
      imported: created.count,
      rows: transactions.length,
      invalid: invalidRows.length,
      invalidRows: invalidRows.slice(0, 20),
      source: "DERIV"
    });
  } catch {
    return NextResponse.json({ error: "Deriv import failed" }, { status: 500 });
  }
}
