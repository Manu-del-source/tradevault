import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/secret-crypto";
import { hasActivePro } from "@/lib/subscription";

function base64url(buffer: Buffer) {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  if (user.role !== "ADMIN" && !(await hasActivePro(user.id))) return NextResponse.redirect(new URL("/billing", request.url));

  const accountId = new URL(request.url).searchParams.get("accountId");
  if (!accountId) return NextResponse.json({ error: "accountId is required" }, { status: 400 });

  const account = await prisma.tradingAccount.findFirst({ where: { id: accountId, userId: user.id } });
  if (!account) return NextResponse.json({ error: "Trading account not found" }, { status: 404 });

  const clientId = process.env.DERIV_OAUTH_CLIENT_ID;
  const redirectUri = process.env.DERIV_OAUTH_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return NextResponse.json({ error: "Deriv OAuth is not configured" }, { status: 500 });
  }

  const verifier = base64url(randomBytes(64));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const state = base64url(randomBytes(32));

  await prisma.derivOAuthState.deleteMany({ where: { userId: user.id, expiresAt: { lt: new Date() } } });
  await prisma.derivOAuthState.create({
    data: {
      state,
      userId: user.id,
      accountId,
      codeVerifier: encryptSecret(verifier),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    }
  });

  const authUrl = new URL("https://auth.deriv.com/oauth2/auth");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", "trade");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  return NextResponse.redirect(authUrl);
}
