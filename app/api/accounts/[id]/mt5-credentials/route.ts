import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

const hashToken = (token: string) =>
  createHash("sha256").update(token, "utf8").digest("hex");

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const account = await prisma.tradingAccount.findFirst({
      where: { id, userId: user.id },
      select: { id: true }
    });

    if (!account) {
      return NextResponse.json({ error: "Trading account not found" }, { status: 404 });
    }

    const token = `tv_mt5_${randomBytes(32).toString("hex")}`;

    await prisma.mt5SyncCredential.upsert({
      where: { accountId: account.id },
      create: {
        accountId: account.id,
        tokenHash: hashToken(token)
      },
      update: {
        tokenHash: hashToken(token),
        lastUsedAt: null
      }
    });

    return NextResponse.json({
      ok: true,
      accountId: account.id,
      token,
      warning: "Store this token securely. TradeVault does not store the plaintext token and it cannot be recovered after this response."
    });
  } catch (error) {
    console.error("MT5 credential creation failed", error);
    return NextResponse.json({ error: "Unable to create MT5 sync credential" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const account = await prisma.tradingAccount.findFirst({
      where: { id, userId: user.id },
      select: { id: true }
    });

    if (!account) {
      return NextResponse.json({ error: "Trading account not found" }, { status: 404 });
    }

    await prisma.mt5SyncCredential.deleteMany({
      where: { accountId: account.id }
    });

    return NextResponse.json({ ok: true, revoked: true });
  } catch (error) {
    console.error("MT5 credential revocation failed", error);
    return NextResponse.json({ error: "Unable to revoke MT5 sync credential" }, { status: 500 });
  }
}
