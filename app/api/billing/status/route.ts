import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const subscription = await prisma.billingSubscription.findUnique({
    where: { userId: user.id },
    select: { plan: true, status: true, currentPeriodEnd: true }
  });
  const active = !!subscription && subscription.status === "ACTIVE" && !!subscription.currentPeriodEnd && subscription.currentPeriodEnd > new Date();
  return NextResponse.json({
    active, plan: active ? subscription?.plan : "FREE",
    expiresAt: active ? subscription?.currentPeriodEnd : null,
    priceKes: Number(process.env.TRADEVAULT_PRO_PRICE_KES || "1000")
  });
}
