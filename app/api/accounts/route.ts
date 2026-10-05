import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEV_EMAIL = process.env.DEV_USER_EMAIL || "tradevault-dev@local.invalid";

async function getDevUser() {
  return prisma.user.upsert({
    where: { email: DEV_EMAIL },
    update: {},
    create: { email: DEV_EMAIL, name: "TradeVault Development User" }
  });
}

export async function GET() {
  try {
    const user = await getDevUser();
    const accounts = await prisma.tradingAccount.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" }
    });

    if (accounts.length) return NextResponse.json(accounts);

    const account = await prisma.tradingAccount.create({
      data: {
        userId: user.id,
        name: "Demo Trading",
        broker: null,
        currency: "USD"
      }
    });

    return NextResponse.json([account]);
  } catch {
    return NextResponse.json({ error: "Unable to load trading accounts" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "Account name is required" }, { status: 400 });

    const user = await getDevUser();
    const account = await prisma.tradingAccount.create({
      data: {
        userId: user.id,
        name,
        broker: body.broker ? String(body.broker).trim() : null,
        accountId: body.accountId ? String(body.accountId).trim() : null,
        currency: body.currency ? String(body.currency).trim().toUpperCase() : "USD"
      }
    });

    return NextResponse.json(account, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unable to create trading account" }, { status: 500 });
  }
}
