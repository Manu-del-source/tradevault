import { NextResponse } from "next/server";
import { createSession, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    if (!email || !email.includes("@") || password.length < 8) return NextResponse.json({ error: "Use a valid email and a password of at least 8 characters." }, { status: 400 });
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
    const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const user = await prisma.user.create({ data: { name: name || null, email, passwordHash: hashPassword(password), role: adminEmail && email === adminEmail ? "ADMIN" : "USER", accounts: { create: { name: "Primary account", currency: "USD" } } } });
    await createSession(user.id);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch { return NextResponse.json({ error: "Unable to create account." }, { status: 500 }); }
}
