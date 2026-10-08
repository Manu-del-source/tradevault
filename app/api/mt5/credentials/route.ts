import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "ADMIN" && !(await (await import("@/lib/subscription")).hasActivePro(user.id))) return NextResponse.json({ error: "MT5 integration is available on TradeVault Pro. Upgrade to continue." }, { status: 403 });

    const body = await request.json();
    const accountId = String(body.accountId ?? "").trim();
    if (!accountId) return NextResponse.json({ error: "Trading account is required." }, { status: 400 });

    const account = await prisma.tradingAccount.findFirst({
      where: { id: accountId, userId: user.id }
    });

    if (!account) return NextResponse.json({ error: "Trading account not found." }, { status: 404 });
    if (account.platform !== "MT5") return NextResponse.json({ error: "This account is not an MT5 account." }, { status: 400 });
    if (!account.accountId) return NextResponse.json({ error: "MT5 login ID is missing." }, { status: 400 });

    const token = "tvmt5_" + randomBytes(32).toString("hex");

    await prisma.mt5SyncCredential.upsert({
      where: { accountId: account.id },
      create: { accountId: account.id, tokenHash: hashToken(token) },
      update: { tokenHash: hashToken(token), lastUsedAt: null }
    });

    return NextResponse.json({
      ok: true,
      token,
      account: {
        id: account.id,
        login: account.accountId,
        environment: account.environment
      },
      warning: "Copy this token now. TradeVault does not store the plaintext token and cannot show it again."
    });
  } catch {
    return NextResponse.json({ error: "Unable to create MT5 bridge token." }, { status: 500 });
  }
}
