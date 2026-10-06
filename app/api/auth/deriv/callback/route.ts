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

    const normalized = accounts
      .map((a) => ({
        id: String(a.account_id ?? a.id ?? a.loginid ?? ""),
        currency: a.currency ? String(a.currency).toUpperCase() : "USD",
        environment:
          a.is_virtual === true || String(a.account_type ?? "").toLowerCase() === "demo"
            ? "DEMO"
            : "REAL"
      }))
      .filter((a) => a.id);

    if (!normalized.length) throw new Error("Deriv account IDs were not returned");

    const pendingAccount = await prisma.tradingAccount.findFirst({
      where: { id: pending.accountId, userId: user.id }
    });
    if (!pendingAccount) throw new Error("TradeVault account was not found");

    const linkedAccounts = [];
    for (let index = 0; index < normalized.length; index++) {
      const item = normalized[index];
      const existing = await prisma.tradingAccount.findFirst({
        where: {
          userId: user.id,
          broker: "Deriv",
          platform: "DERIV",
          accountId: item.id
        }
      });

      const target = existing ?? (index === 0
        ? pendingAccount
        : await prisma.tradingAccount.create({
            data: {
              userId: user.id,
              name: "Deriv " + item.environment + " account",
              broker: "Deriv",
              platform: "DERIV",
              environment: item.environment,
              accountId: item.id,
              currency: item.currency
            }
          }));

      await prisma.tradingAccount.update({
        where: { id: target.id },
        data: {
          broker: "Deriv",
          platform: "DERIV",
          environment: item.environment,
          accountId: item.id,
          currency: item.currency
        }
      });

      await prisma.derivOAuthCredential.upsert({
        where: { accountId: target.id },
        create: {
          accountId: target.id,
          derivAccountId: item.id,
          accessToken: encryptSecret(String(token.access_token)),
          refreshToken: token.refresh_token ? encryptSecret(String(token.refresh_token)) : null,
          expiresAt: token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000) : null
        },
        update: {
          derivAccountId: item.id,
          accessToken: encryptSecret(String(token.access_token)),
          refreshToken: token.refresh_token ? encryptSecret(String(token.refresh_token)) : null,
          expiresAt: token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000) : null
        }
      });

      linkedAccounts.push(target.id);
    }

    const syncTarget = normalized[0];
    const syncAccount = await prisma.tradingAccount.findFirst({
      where: {
        userId: user.id,
        broker: "Deriv",
        platform: "DERIV",
        accountId: syncTarget.id
      }
    });
    if (!syncAccount) throw new Error("Linked Deriv account could not be located");

    await prisma.derivOAuthState.delete({ where: { id: pending.id } });

    let syncStatus = "connected";
    try {
      await syncDerivAccount(syncAccount.id, user.id);
      syncStatus = "synced";
    } catch {
      syncStatus = "connected";
    }

    return redirect(
      syncStatus,
      "&accountId=" + encodeURIComponent(syncAccount.id) +
      "&linked=" + encodeURIComponent(String(linkedAccounts.length))
    );
  } catch {
    await prisma.derivOAuthState.delete({ where: { id: pending.id } }).catch(() => undefined);
    return redirect("error");
  }
}
