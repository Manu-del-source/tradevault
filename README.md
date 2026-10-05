# TradeVault

TradeVault is an automated trading journal and performance analytics platform.

## Current foundation

- Next.js App Router + TypeScript
- Dark trading-terminal dashboard
- Journal, analytics and AI review screens
- Prisma/PostgreSQL domain model
- Persistent trading accounts and trades
- Manual trade CRUD API
- CSV trade import API
- Broker-ready source types for MT5 and Deriv

## Database setup

Copy `.env.example` to `.env.local`, set a PostgreSQL connection string, then run:

```bash
npm install
npx prisma generate
npx prisma db push
npm run dev
```

The application expects:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/tradevault"
```

## API

### Create a trade

`POST /api/trades`

```json
{
  "accountId": "account_id",
  "symbol": "XAUUSD",
  "side": "LONG",
  "pnl": 250,
  "strategy": "Liquidity Sweep + FVG",
  "session": "London"
}
```

### List trades

`GET /api/trades?accountId=account_id`

### Import CSV

`POST /api/trades/import` using multipart form data with `accountId` and `file`.

Accepted generic CSV columns include `symbol`, `side`, `pnl`, `volume`, `strategy`, `session`, `closed_at`, `notes`. MT5 imports use the broker history fields described below. Deriv history can be imported as the JSON response from the authenticated `profit_table` endpoint.

For MT5 exports, choose **MetaTrader 5** in the import dialog. TradeVault groups deals by `position_id`, pairs a normal opening deal with its closing deal(s), preserves the original LONG/SHORT direction, calculates a volume-weighted exit price when multiple exits are present, and combines `Profit + Swap + Commission` across the position into the stored net P&L. Re-importing the same position is protected by a deterministic `position:<position_id>` external ID. Complex positions with multiple opening deals are reported instead of being silently reconstructed. MT5 imports are read-only; TradeVault never sends orders to MetaTrader.

## Roadmap

1. Authentication and user-owned accounts
2. Account creation/settings
3. Connect the dashboard and journal to PostgreSQL
4. CSV import UI with validation/preview
5. MT5 position-level reconciliation and synchronization
6. Deriv synchronization service
7. Screenshots, tags and trade notes
8. Real performance analytics
9. AI-generated trading reviews
10. Background sync jobs and alerts

### Deriv history import

Deriv's authenticated `profit_table` endpoint provides completed-contract profit/loss history and supports pagination with `limit` and `offset`. TradeVault accepts a saved JSON response from that endpoint through **Deriv JSON** import, stores the Deriv `contract_id` as the stable external identifier, preserves `contract_type`, and calculates contract P&L from `sell_price - buy_price` (falling back to payout only when sell price is absent). Because these are contract cash values rather than market prices, TradeVault does not put them into the conventional entry/exit price or volume fields; the stake and return are preserved in notes. Directional contract types are mapped to LONG/SHORT; the contract type itself is retained for analytics.

TradeVault records and analyzes trading activity; it does not execute trades.
