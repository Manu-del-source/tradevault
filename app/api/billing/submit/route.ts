import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const transactionCode = String(body?.transactionCode || "").trim().toUpperCase();
  const reference = String(body?.reference || "").trim();

  if (!transactionCode || transactionCode.length < 8 || transactionCode.length > 32) {
    return NextResponse.json({ error: "Enter a valid M-PESA transaction code." }, { status: 400 });
  }
  if (!/^([A-Z0-9]+)$/.test(transactionCode)) {
    return NextResponse.json({ error: "M-PESA transaction code contains invalid characters." }, { status: 400 });
  }

  const payment = reference
    ? await prisma.payment.findFirst({ where: { reference, userId: user.id, status: "PENDING" } })
    : await prisma.payment.findFirst({ where: { userId: user.id, provider: "MPESA_TILL", status: "PENDING" }, orderBy: { createdAt: "desc" } });

  if (!payment) return NextResponse.json({ error: "No pending payment was found. Start the payment again." }, { status: 404);

  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: { providerInvoiceId: transactionCode, reference: payment.reference, status: "SUBMITTED" }
  });

  return NextResponse.json({ ok: true, paymentId: updated.id, status: updated.status });
}
