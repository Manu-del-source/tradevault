import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/secret-crypto";

const API_BASE = "https://api.derivws.com";

type DerivAccount = {
  account_id?: string;
  loginid?: string;
  id?: string;
  currency?: string;
  is_virtual?: boolean;
  account_type?: string;
};

function accountIdOf(account: DerivAccount) {
  return String(account.account_id ?? account.id ?? account.loginid ?? "");
}

async function getDerivAccounts(token: string): Promise<DerivAccount[]> {
  const response = await fetch(API_BASE + "/trading/v1/options/accounts", {
    headers: { Authorization: "Bearer " + token, Accept: "application/json" },
    cache: "no-store"
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("Unable to retrieve Deriv trading accounts");
  const data = body?.data ?? body?.accounts ?? body;
  return Array.isArray(data) ? data : Array.isArray(data?.accounts) ? data.accounts : [];
}

async function getWebSocketUrl(token: string, derivAccountId: string) {
  const response = await fetch(
    API_BASE + "/trading/v1/options/accounts/" + encodeURIComponent(derivAccountId) + "/otp",
    { method: "POST", headers: { Authorization: "Bearer " + token }, cache: "no-store" }
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.data?.url) throw new Error("Unable to open authenticated Deriv session");
  return String(body.data.url);
}

async function profitTable(wsUrl: string) {
  const WebSocketCtor = globalThis.WebSocket;
  if (!WebSocketCtor) throw new Error("WebSocket is not available in this runtime");

  return await new Promise<any>((resolve, reject) => {
    const ws = new WebSocketCtor(wsUrl);
    const timer = setTimeout(() => {
      try { ws.close(); } catch {}
      reject(new Error("Deriv history request timed out"));
    }, 20000);

    const finish = (fn: (value: any) => void, value: any) => {
      clearTimeout(timer);
      try { ws.close(); } catch {}
      fn(value);
    };

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({
        profit_table: 1,
        description: 1,
        limit: 500,
        offset: 0,
        sort: "DESC"
      }));
    });

    ws.addEventListener("message", event => {
      try {
        const payload = JSON.parse(String(event.data));
        if (payload?.error) return finish(reject, new Error(String(payload.error.message ?? "Deriv history request failed")));
        if (payload?.msg_type === "profit_table") finish(resolve, payload?.profit_table ?? {});
      } catch {
        finish(reject, new Error("Invalid response from Deriv"));
      }
    });

    ws.addEventListener("error", () => finish(reject, new Error("Deriv WebSocket connection failed")));
  });
}

function epochDate(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000);
}

function number(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sideFor(contractType: string) {
  const type = contractType.toLowerCase();
  if (/(put|fall|down|lower|bear)/.test(type)) return "SHORT" as const;
  return "LONG" as const;
}

export async function syncDerivAccount(accountId: string, userId: string) {
  const account = await prisma.tradingAccount.findFirst({
    where: { id: accountId, userId },
    include: { derivCredential: true }
  });
  if (!account?.derivCredential) throw new Error("Deriv account is not connected");

  let token: string;
  try {
    token = decryptSecret(account.derivCredential.accessToken);
  } catch {
    throw new Error("Deriv connection could not be decrypted; reconnect the account");
  }

  const wsUrl = await getWebSocketUrl(token, account.derivCredential.derivAccountId);
  const table = await profitTable(wsUrl);
  const transactions = Array.isArray(table?.transactions) ? table.transactions : [];

  const rows = transactions.flatMap((t: any) => {
    const contractId = t?.contract_id ?? t?.contractId;
    const transactionId = t?.transaction_id ?? t?.transactionId;
    const externalId = contractId != null ? String(contractId) : transactionId != null ? String(transactionId) : "";
    const symbol = String(t?.underlying_symbol ?? t?.symbol ?? "DERIV").trim().toUpperCase();
    const contractType = t?.contract_type ? String(t.contract_type) : null;
    const buyPrice = number(t?.buy_price);
    const sellPrice = number(t?.sell_price);
    const payout = number(t?.payout);
    const pnl = sellPrice != null && buyPrice != null
      ? sellPrice - buyPrice
      : payout != null && buyPrice != null
        ? payout - buyPrice
        : null;
    const openedAt = epochDate(t?.purchase_time);
    const closedAt = epochDate(t?.transaction_time) ?? epochDate(t?.expiry_time);

    if (!externalId || !symbol || pnl == null || !closedAt) return [];
    return [{
      accountId,
      externalId,
      contractType,
      symbol,
      side: sideFor(contractType ?? ""),
      pnl,
      entryPrice: buyPrice,
      exitPrice: sellPrice,
      volume: buyPrice,
      openedAt,
      closedAt,
      source: "DERIV" as const
    }];
  });

  const created = rows.length ? await prisma.trade.createMany({ data: rows, skipDuplicates: true }) : { count: 0 };
  await prisma.derivOAuthCredential.update({
    where: { accountId },
    data: { lastSyncAt: new Date() }
  });

  return { imported: created.count, received: transactions.length, accountId, derivAccountId: account.derivCredential.derivAccountId };
}

export { getDerivAccounts };
