import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const payments = await prisma.payment.findMany({
    where: { provider: "MPESA_TILL" },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { email: true, name: true } } }
  });

  return NextResponse.json({ payments });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const paymentId = String(body?.paymentId || "");
  const action = String(body?.action || "");

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.provider !== "MPESA_TILL") {
    return NextResponse.json({ error: "Payment not found." }, { status: 404 });
  }

  if (action === "reject") {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "REJECTED" } });
    return NextResponse.json({ ok: true, status: "REJECTED" });
  }

  if (action !== "approve") return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  if (payment.status === "COMPLETE") return NextResponse.json({ ok: true, status: "COMPLETE" });

  const now = new Date();
  const current = await prisma.billingSubscription.findUnique({ where: { userId: payment.userId } });
  const start = current?.status === "ACTIVE" && current.currentPeriodEnd && current.currentPeriodEnd > now ? current.currentPeriodEnd : now;
  const end = new Date(start);
  end.setDate(end.getDate() + 30);

  await prisma.$transaction(async tx => {
    const subscription = await tx.billingSubscription.upsert({
      where: { userId: payment.userId },
      create: { userId: payment.userId, plan: "PRO", status: "ACTIVE", provider: "MPESA_TILL", currentPeriodStart: start, currentPeriodEnd: end },
      update: { plan: "PRO", status: "ACTIVE", provider: "MPESA_TILL", currentPeriodStart: start, currentPeriodEnd: end }
    });
    await tx.payment.update({ where: { id: payment.id }, data: { status: "COMPLETE", subscriptionId: subscription.id } });
  });

  return NextResponse.json({ ok: true, status: "COMPLETE", expiresAt: end });
}
