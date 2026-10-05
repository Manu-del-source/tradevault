import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const accounts = await prisma.tradingAccount.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
    return NextResponse.json(accounts);
  } catch {
    return NextResponse.json({ error: "Unable to load trading accounts" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "Account name is required" }, { status: 400 });
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
