import { prisma } from "@/lib/prisma";

export const FREE_TRADE_LIMIT = 25;
export const FREE_ACCOUNT_LIMIT = 1;

export async function hasActivePro(userId: string) {
  const subscription = await prisma.billingSubscription.findUnique({
    where: { userId },
    select: { status: true, currentPeriodEnd: true }
  });
  return subscription?.status === "ACTIVE" && !!subscription.currentPeriodEnd && subscription.currentPeriodEnd > new Date();
}

export async function requirePro(userId: string) {
  return hasActivePro(userId);
}

export function isAdmin(user: { role?: string | null }) {
  return user.role === "ADMIN";
}
