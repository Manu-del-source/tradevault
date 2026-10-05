import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/secret-crypto";
import { getDerivAccounts, syncDerivAccount } from "@/lib/deriv";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const user = await getCurrentUser();
  const redirect = (status: string, extra = "") =>
    NextResponse.redirect(new URL("/dashboard?deriv=" + status + extra, request.url));

  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const error = url.searchParams.get("error");
  if (error) return redirect("denied");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return redirect("error");

  const pending = await prisma.derivOAuthState.findUnique({ where: { state } });
  if (!pending || pending.userId !== user.id || pending.expiresAt <= new Date()) {
    return redirect("invalid_state");
  }

  const clientId = process.env.DERIV_OAUTH_CLIENT_ID;
  const redirectUri = process.env.DERIV_OAUTH_REDIRECT_URI;
  if (!clientId || !redirectUri) return redirect("config");

  try {
    const verifier = decryptSecret(pending.codeVerifier);
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri
    });
    const clientSecret = process.env.DERIV_OAUTH_CLIENT_SECRET;
    if (clientSecret) body.set("client_secret", clientSecret);

    const response = await fetch("https://auth.deriv.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store"
    });
    const token = await response.json().catch(() => ({}));
    if (!response.ok || !token.access_token) throw new Error("Deriv token exchange failed");

    const accounts = await getDerivAccounts(String(token.access_token));
    if (!accounts.length) throw new Error("No Deriv trading account was returned");

    const deriv = accounts.find(a => a.account_id || a.id || a.loginid) ?? accounts[0];
    const derivAccountId = String(deriv.account_id ?? deriv.id ?? deriv.loginid);
    if (!derivAccountId) throw new Error("Deriv account ID was not returned");

    await prisma.derivOAuthCredential.upsert({
      where: { accountId: pending.accountId },
      create: {
        accountId: pending.accountId,
        derivAccountId,
        accessToken: encryptSecret(String(token.access_token)),
        refreshToken: token.refresh_token ? encryptSecret(String(token.refresh_token)) : null,
        expiresAt: token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000) : null
      },
      update: {
        derivAccountId,
        accessToken: encryptSecret(String(token.access_token)),
        refreshToken: token.refresh_token ? encryptSecret(String(token.refresh_token)) : null,
        expiresAt: token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000) : null
      }
    });

    await prisma.tradingAccount.update({
      where: { id: pending.accountId },
      data: {
        broker: "Deriv",
        accountId: derivAccountId,
        currency: deriv.currency ? String(deriv.currency).toUpperCase() : undefined
      }
    });

    await prisma.derivOAuthState.delete({ where: { id: pending.id } });

    let syncStatus = "connected";
    try {
      await syncDerivAccount(pending.accountId, user.id);
      syncStatus = "synced";
    } catch {
      syncStatus = "connected";
    }

    return redirect(syncStatus, "&accountId=" + encodeURIComponent(pending.accountId));
  } catch {
    await prisma.derivOAuthState.delete({ where: { id: pending.id } }).catch(() => undefined);
    return redirect("error");
  }
}
