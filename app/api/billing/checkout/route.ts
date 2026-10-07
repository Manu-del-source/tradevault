import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "node:crypto";

const PRICE_KES = Number(process.env.TRADEVAULT_PRO_PRICE_KES || "1000");

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const key = process.env.INTASEND_SECRET_KEY;
  if (!key) return NextResponse.json({ error: "Payments are not configured yet." }, { status: 503 });
  const reference = "tv-" + crypto.randomBytes(12).toString("hex");
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://vault.smartbiz365.site";
  const response = await fetch("https://api.intasend.com/api/v1/checkout/", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: PRICE_KES, currency: "KES", email: user.email,
      first_name: user.name?.split(" ")[0] || "TradeVault",
      last_name: user.name?.split(" ").slice(1).join(" ") || "Trader",
      api_ref: reference, unique_api_ref: true,
      redirect_url: `${baseUrl}/billing?payment=pending&ref=${encodeURIComponent(reference)}`,
      host: baseUrl
    })
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.id || !data?.url) return NextResponse.json({ error: "Unable to create payment checkout." }, { status: 502 });
  await prisma.payment.create({ data: {
    userId: user.id, provider: "INTASEND", providerInvoiceId: String(data.id),
    reference, amount: PRICE_KES, currency: "KES", status: "PENDING"
  }});
  return NextResponse.json({ url: data.url, reference });
}
