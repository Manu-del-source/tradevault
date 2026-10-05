# MT5 live history synchronization

TradeVault's MT5 bridge is **read-only**. The Expert Advisor reads closed MT5 positions and sends position summaries to:

POST /api/trades/sync/mt5

It never places, modifies, or closes orders.

## Vercel configuration

Add this environment variable:

MT5_SYNC_TOKEN=<long-random-secret>

Redeploy after adding it.

## MT5 setup

1. Compile `mt5/TradeVaultSync.mq5` in MetaEditor.
2. Set `SyncUrl` to the deployed TradeVault endpoint.
3. Set `SyncToken` to the exact value used by `MT5_SYNC_TOKEN`.
4. Set `TradeVaultAccountId` to the TradingAccount ID from TradeVault.
5. In MT5, open Tools -> Options -> Expert Advisors.
6. Enable WebRequest for the TradeVault domain, for example:
   `https://your-project.vercel.app`
7. Attach the EA to any chart.
8. Leave Algo Trading enabled if required by the terminal for EAs, although this EA contains no trading functions.
9. The EA syncs the recent closed history immediately and then periodically.

## Security

The sync endpoint accepts only requests containing:

Authorization: Bearer <MT5_SYNC_TOKEN>

Do not put a broker password into the EA. The token is a TradeVault application credential.

## Position identity

The EA sends:

`position:<MT5 position id>`

as `externalId`. TradeVault upserts by account + externalId, so repeated scans of the same closed positions update the record rather than creating duplicates.

## Scope

This first bridge synchronizes closed positions. It is not a trading bot, signal engine, or order-execution connector.
