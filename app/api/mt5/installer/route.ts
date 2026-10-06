import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function hashToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
function ps(value: string) { return value.replace(/'/g, "''"); }

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json();
    const accountId = String(body.accountId ?? "").trim();
    if (!accountId) return NextResponse.json({ error: "Trading account is required." }, { status: 400 });

    const account = await prisma.tradingAccount.findFirst({ where: { id: accountId, userId: user.id } });
    if (!account || account.platform !== "MT5" || !account.accountId) {
      return NextResponse.json({ error: "Valid MT5 account is required." }, { status: 400 });
    }

    const token = "tvmt5_" + randomBytes(32).toString("hex");
    await prisma.mt5SyncCredential.upsert({
      where: { accountId: account.id },
      create: { accountId: account.id, tokenHash: hashToken(token) },
      update: { tokenHash: hashToken(token), lastUsedAt: null }
    });

    const installerTemplate = String.raw`# TradeVault MT5 Bridge Installer
$ErrorActionPreference = "Stop"
$TradeVaultUrl = '__URL__'
$SyncToken = '__TOKEN__'
$AccountLogin = '__LOGIN__'
$SourceUrl = '__SOURCE__'
$Temp = Join-Path $env:TEMP 'TradeVaultBridge.mq5'

Write-Host "TradeVault MT5 Bridge" -ForegroundColor Cyan
Write-Host "Account: $AccountLogin"
Write-Host ""

try {
  Invoke-WebRequest -Uri $SourceUrl -OutFile $Temp -UseBasicParsing
  $root = Join-Path $env:APPDATA 'MetaQuotes\\Terminal'
  $terminals = Get-ChildItem $root -Directory -ErrorAction SilentlyContinue
  $targets = @()

  foreach ($terminal in $terminals) {
    $mql5 = Join-Path $terminal.FullName 'MQL5'
    if (Test-Path $mql5) {
      $experts = Join-Path $mql5 'Experts'
      New-Item -ItemType Directory -Force -Path $experts | Out-Null
      $target = Join-Path $experts 'TradeVaultBridge.mq5'
      Copy-Item $Temp $target -Force
      $targets += @{ terminal=$terminal; source=$target }
    }
  }

  if ($targets.Count -eq 0) {
    throw "No MetaTrader 5 data folder was found. Open MT5 once, then run this installer again."
  }

  $editors = @(
    (Join-Path $env:ProgramFiles 'MetaTrader 5\\metaeditor64.exe'),
    (Join-Path $env:ProgramFiles 'MetaTrader 5\\metaeditor.exe'),
    (Join-Path \${env:ProgramFiles(x86)} 'MetaTrader 5\\metaeditor64.exe'),
    (Join-Path \${env:ProgramFiles(x86)} 'MetaTrader 5\\metaeditor.exe')
  ) | Where-Object { Test-Path $_ }

  if ($editors.Count -eq 0) {
    $editors = Get-ChildItem $env:ProgramFiles -Filter metaeditor64.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName -First 3
  }
  if ($editors.Count -eq 0) {
    throw "MetaEditor was not found. Please install MT5 first, then run this setup again."
  }

  $editor = $editors | Select-Object -First 1
  $compiled = 0
  foreach ($item in $targets) {
    $source = Get-Content $item.source -Raw
    $source = $source -replace 'input string TradeVaultURL = "[^"]*";', ('input string TradeVaultURL = "' + $TradeVaultUrl + '";')
    $source = $source -replace 'input string SyncToken = "[^"]*";', ('input string SyncToken = "' + $SyncToken + '";')
    Set-Content -Path $item.source -Value $source -Encoding UTF8
    & $editor /compile:"$($item.source)" /log
    $compiled++
  }

  Write-Host ""
  Write-Host "Bridge installed and compiled in $compiled MT5 terminal(s)." -ForegroundColor Green
  Write-Host "Next: open MT5 -> Navigator -> Expert Advisors -> TradeVaultBridge, then attach it to any chart." -ForegroundColor Yellow
  Write-Host "The bridge is read-only and only sends closed trade history." -ForegroundColor Green
} catch {
  Write-Host ""
  Write-Host ("Installation failed: " + $_.Exception.Message) -ForegroundColor Red
  exit 1
} finally {
  Remove-Item $Temp -Force -ErrorAction SilentlyContinue
}
`;

    const script = installerTemplate
      .replace("__URL__", "https://vault.smartbiz365.site/api/mt5/ingest")
      .replace("__TOKEN__", ps(token))
      .replace("__LOGIN__", ps(account.accountId))
      .replace("__SOURCE__", "https://raw.githubusercontent.com/Manu-del-source/tradevault/main/mt5/TradeVaultBridge.mq5");

    return new NextResponse(script, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": 'attachment; filename="TradeVault-MT5-Setup.ps1"',
        "Cache-Control": "no-store"
      }
    });
  } catch {
    return NextResponse.json({ error: "Unable to create MT5 installer." }, { status: 500 });
  }
}
