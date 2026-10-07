import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "node:crypto";

const PRICE_KES = Number(process.env.TRADEVAULT_PRO_PRICE_KES || "1000");

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const till = process.env.MPESA_TILL_NUMBER;
  if (!till) return NextResponse.json({ error: "M-Pesa Till payments are not configured yet." }, { status: 503 });

  const reference = "tv-" + crypto.randomBytes(12).toString("hex");
  const payment = await prisma.payment.create({
    data: {
      userId: user.id,
      provider: "MPESA_TILL",
      providerInvoiceId: reference,
      reference,
      amount: PRICE_KES,
      currency: "KES",
      status: "PENDING"
    }
  });

  return NextResponse.json({
    reference: payment.reference,
    tillNumber: till,
    amount: PRICE_KES
  });
}
