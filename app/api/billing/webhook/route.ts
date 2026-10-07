import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const challenge = process.env.INTASEND_WEBHOOK_CHALLENGE;
  const event = await request.json().catch(() => null);
  if (!challenge || !event || event.challenge !== challenge) return new NextResponse("Unauthorized", { status: 401 });
  if (event.topic !== "collection_event") return NextResponse.json({ ok: true });
  const reference = String(event.api_ref || "");
  if (!reference) return NextResponse.json({ ok: true });
  const payment = await prisma.payment.findUnique({ where: { reference } });
  if (!payment) return NextResponse.json({ ok: true });

  const state = String(event.state || "PENDING");
  const mapped = state === "COMPLETE" ? "COMPLETE" : state === "FAILED" ? "FAILED" : state === "CANCELED" ? "CANCELED" : "PENDING";
  if (mapped !== "COMPLETE") {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: mapped } });
    return NextResponse.json({ ok: true });
  }
  if (payment.status === "COMPLETE") return NextResponse.json({ ok: true });

  const now = new Date();
  const current = await prisma.billingSubscription.findUnique({ where: { userId: payment.userId } });
  const start = current?.currentPeriodEnd && current.currentPeriodEnd > now ? current.currentPeriodEnd : now;
  const end = new Date(start);
  end.setDate(end.getDate() + 30);

  await prisma.$transaction(async tx => {
    const subscription = await tx.billingSubscription.upsert({
      where: { userId: payment.userId },
      create: { userId: payment.userId, plan: "PRO", status: "ACTIVE", provider: "INTASEND", currentPeriodStart: start, currentPeriodEnd: end },
      update: { plan: "PRO", status: "ACTIVE", provider: "INTASEND", currentPeriodStart: start, currentPeriodEnd: end }
    });
    await tx.payment.update({ where: { id: payment.id }, data: { status: "COMPLETE", subscriptionId: subscription.id } });
  });
  return NextResponse.json({ ok: true });
}
