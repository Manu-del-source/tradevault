# MT5 live history synchronization

TradeVault's MT5 bridge is **read-only**. The Expert Advisor reads closed MT5 positions and sends position summaries to:

POST /api/trades/sync/mt5

It never places, modifies, or closes orders.

## Vercel configuration

Add this environment variable:

`MT5_SYNC_TOKEN=<long-random-secret>`

Redeploy after adding it.

## MT5 setup

1. Compile `mt5/TradeVaultSync.mq5` in MetaEditor.
2. Set `SyncUrl` to the deployed TradeVault endpoint.
3. Set `SyncToken` to the exact value used by `MT5_SYNC_TOKEN`.
4. Set `TradeVaultAccountId` to the TradingAccount ID from TradeVault.
5. Set `BrokerUtcOffsetHours` to the MT5 broker/server UTC offset used by the account. For example, UTC+2 = `2`, UTC+3 = `3`.
6. In MT5, open Tools -> Options -> Expert Advisors.
7. Enable WebRequest for the TradeVault domain, for example:
   `https://your-project.vercel.app`
8. Attach the EA to any chart.
9. The EA syncs recent closed history immediately and then periodically.
10. The EA does not need trading permissions for its own logic; it only uses history access and HTTP WebRequest.

## What the EA synchronizes

The EA discovers positions that have closing activity within `LookbackDays`, then calls `HistorySelectByPosition()` to reconstruct the **complete position lifecycle**. This means the opening deal can be older than the lookback window without being lost.

For each normal position it:

- calculates a volume-weighted average entry price;
- calculates a volume-weighted average exit price;
- aggregates profit + commission + swap across the position's deals;
- preserves the original opening volume;
- preserves the earliest opening time and latest closing time;
- includes magic number/comment information in the strategy field;
- upserts using `position:<MT5 position id>`.

Multiple opening deals are supported.

## Complex/reversal positions

Positions containing `DEAL_ENTRY_INOUT` reversal activity are deliberately skipped rather than converted into an inaccurate single TradeVault trade. The EA prints the position ID in the MT5 Experts/Journal log.

Close-by activity (`DEAL_ENTRY_OUT_BY`) is accepted and marked in the TradeVault notes.

## Time handling

MT5 deal timestamps are broker/server time. The EA converts them to UTC using `BrokerUtcOffsetHours` and sends ISO-8601 timestamps such as:

`2026-10-05T16:30:00Z`

Use the broker's actual server UTC offset. If the broker changes its server offset seasonally, update this input accordingly.

## Security

The sync endpoint accepts only requests containing:

`Authorization: Bearer <MT5_SYNC_TOKEN>`

Do not put a broker password into the EA. The token is a TradeVault application credential.

For a multi-user production deployment, the endpoint should eventually use account-scoped sync credentials rather than one global token.

## Duplicate protection

The EA sends:

`position:<MT5 position id>`

as `externalId`. TradeVault upserts by account + externalId, so repeated scans of the same closed positions update the record rather than creating duplicates.

## Scope

This bridge synchronizes **closed MT5 positions only**. It is not a trading bot, signal engine, or order-execution connector.
