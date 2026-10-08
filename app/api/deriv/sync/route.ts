import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { syncDerivAccount } from "@/lib/deriv";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN" && !(await (await import("@/lib/subscription")).hasActivePro(user.id))) return NextResponse.json({ error: "Deriv sync is available on TradeVault Pro. Upgrade to continue." }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const accountId = String(body.accountId ?? "");
  if (!accountId) return NextResponse.json({ error: "accountId is required" }, { status: 400 });

  try {
    return NextResponse.json(await syncDerivAccount(accountId, user.id));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Deriv sync failed" },
      { status: 400 }
    );
  }
}
