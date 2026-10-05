import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "TradeVault — Automated Trading Journal", description: "Track, analyze, and improve your trading performance." };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }
