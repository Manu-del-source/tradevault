#property strict
#property version   "1.1"
#property description "TradeVault read-only MT5 history synchronizer"

input string SyncUrl = "https://YOUR-TRADEVAULT-DOMAIN.vercel.app/api/trades/sync/mt5";
input string SyncToken = "tv_mt5_your_account_scoped_token";
input string TradeVaultAccountId = "YOUR_ACCOUNT_ID";
input int LookbackDays = 30;
input int SyncIntervalSeconds = 60;
input int BrokerUtcOffsetHours = 0; // Example: UTC+2 broker = 2, UTC+3 broker = 3

struct PositionSummary
{
   ulong position_id;
   string symbol;
   double entry_price_sum;
   double entry_volume;
   double exit_price_sum;
   double exit_volume;
   double pnl;
   datetime opened_at;
   datetime closed_at;
   long magic;
   string comment;
   double stop_loss;
   double take_profit;
   long entry_type;
   bool has_entry;
   bool has_reversal;
   bool has_exit_by;
};

string JsonEscape(string value)
{
   StringReplace(value, "\\", "\\\\");
   StringReplace(value, "\"", "\\\"");
   StringReplace(value, "\r", "\\r");
   StringReplace(value, "\n", "\\n");
   StringReplace(value, "\t", "\\t");
   return value;
}

string IsoTime(datetime value)
{
   // MT5 history timestamps are broker/server time. Convert that server
   // clock to UTC before sending it to the Vercel/JavaScript API.
   datetime utc_value = value - (BrokerUtcOffsetHours * 3600);
   MqlDateTime tm = {};
   if(!TimeToStruct(utc_value, tm))
      return "";

   return StringFormat("%04d-%02d-%02dT%02d:%02d:%02dZ",
                       tm.year, tm.mon, tm.day,
                       tm.hour, tm.min, tm.sec);
}

string Side(long deal_type)
{
   if(deal_type == DEAL_TYPE_SELL)
      return "SHORT";
   return "LONG";
}

bool IsPlaceholder(string value)
{
   return value == "" ||
          StringFind(value, "tv_mt5_your_account_scoped_token") >= 0 ||
          value == "YOUR_ACCOUNT_ID" ||
          StringFind(value, "YOUR-TRADEVAULT-DOMAIN") >= 0;
}

int OnInit()
{
   if(IsPlaceholder(SyncUrl))
   {
      Print("TradeVault: configure SyncUrl before starting the EA.");
      return(INIT_PARAMETERS_INCORRECT);
   }

   if(IsPlaceholder(SyncToken))
   {
      Print("TradeVault: configure SyncToken before starting the EA.");
      return(INIT_PARAMETERS_INCORRECT);
   }

   if(IsPlaceholder(TradeVaultAccountId))
   {
      Print("TradeVault: configure TradeVaultAccountId before starting the EA.");
      return(INIT_PARAMETERS_INCORRECT);
   }

   if(BrokerUtcOffsetHours < -14 || BrokerUtcOffsetHours > 14)
   {
      Print("TradeVault: BrokerUtcOffsetHours must be between -14 and +14.");
      return(INIT_PARAMETERS_INCORRECT);
   }

   if(LookbackDays < 1)
   {
      Print("TradeVault: LookbackDays must be at least 1.");
      return(INIT_PARAMETERS_INCORRECT);
   }

   int interval = SyncIntervalSeconds < 10 ? 10 : SyncIntervalSeconds;
   if(!EventSetTimer(interval))
   {
      Print("TradeVault: EventSetTimer failed. Error=", GetLastError());
      return(INIT_FAILED);
   }

   Print("TradeVault: initialized. Read-only mode; no trading operations are performed.");
   SyncClosedPositions();
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
   EventKillTimer();
}

void OnTimer()
{
   SyncClosedPositions();
}

int FindPosition(PositionSummary &positions[], int count, ulong position_id)
{
   for(int i = 0; i < count; i++)
   {
      if(positions[i].position_id == position_id)
         return i;
   }
   return -1;
}

void SyncClosedPositions()
{
   datetime to = TimeCurrent();
   datetime from = to - (LookbackDays * 86400);

   if(!HistorySelect(from, to))
   {
      Print("TradeVault: HistorySelect failed. Error=", GetLastError());
      return;
   }

   int total = HistoryDealsTotal();
   if(total <= 0)
      return;

   PositionSummary positions[];
   int position_count = 0;

   // First pass: discover positions with closing activity in the lookback window.
   for(int i = 0; i < total; i++)
   {
      ulong deal = HistoryDealGetTicket(i);
      if(deal == 0)
         continue;

      ulong position_id = (ulong)HistoryDealGetInteger(deal, DEAL_POSITION_ID);
      if(position_id == 0)
         continue;

      ENUM_DEAL_ENTRY entry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(deal, DEAL_ENTRY);
      if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_OUT_BY)
         continue;

      int index = FindPosition(positions, position_count, position_id);
      if(index >= 0)
         continue;

      ArrayResize(positions, position_count + 1);
      index = position_count++;
      ZeroMemory(positions[index]);

      positions[index].position_id = position_id;
      positions[index].symbol = HistoryDealGetString(deal, DEAL_SYMBOL);
      positions[index].entry_type = DEAL_TYPE_BUY;
   }

   if(position_count == 0)
      return;

   string trades = "";
   int synced_count = 0;
   int skipped_complex = 0;
   int skipped_incomplete = 0;

   for(int p = 0; p < position_count; p++)
   {
      ulong position_id = positions[p].position_id;

      // Select the complete lifecycle of this position. This avoids losing the
      // opening deal when a position was held longer than LookbackDays.
      ResetLastError();
      if(!HistorySelectByPosition(position_id))
      {
         Print("TradeVault: HistorySelectByPosition failed for position ",
               IntegerToString((long)position_id),
               ". Error=", GetLastError());
         skipped_incomplete++;
         continue;
      }

      int deals = HistoryDealsTotal();
      if(deals <= 0)
      {
         skipped_incomplete++;
         continue;
      }

      for(int i = 0; i < deals; i++)
      {
         ulong deal = HistoryDealGetTicket(i);
         if(deal == 0)
            continue;

         ENUM_DEAL_ENTRY entry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(deal, DEAL_ENTRY);
         long deal_type = HistoryDealGetInteger(deal, DEAL_TYPE);
         datetime deal_time = (datetime)HistoryDealGetInteger(deal, DEAL_TIME);
         double volume = HistoryDealGetDouble(deal, DEAL_VOLUME);
         double price = HistoryDealGetDouble(deal, DEAL_PRICE);
         double profit = HistoryDealGetDouble(deal, DEAL_PROFIT);
         double commission = HistoryDealGetDouble(deal, DEAL_COMMISSION);
         double swap = HistoryDealGetDouble(deal, DEAL_SWAP);

         // Include all position-level P&L components, including opening
         // commissions, so the journal matches MT5's net result.
         positions[p].pnl += profit + commission + swap;

         if(positions[p].symbol == "")
            positions[p].symbol = HistoryDealGetString(deal, DEAL_SYMBOL);

         long magic = HistoryDealGetInteger(deal, DEAL_MAGIC);
         string comment = HistoryDealGetString(deal, DEAL_COMMENT);

         if(magic != 0)
            positions[p].magic = magic;
         if(comment != "")
            positions[p].comment = comment;

         if(entry == DEAL_ENTRY_IN)
         {
            if(!positions[p].has_entry)
            {
               positions[p].entry_type = deal_type;
               positions[p].stop_loss = HistoryDealGetDouble(deal, DEAL_SL);
               positions[p].take_profit = HistoryDealGetDouble(deal, DEAL_TP);
               positions[p].opened_at = deal_time;
               positions[p].has_entry = true;
            }
            else if(deal_time < positions[p].opened_at)
            {
               positions[p].entry_type = deal_type;
               positions[p].opened_at = deal_time;
               positions[p].stop_loss = HistoryDealGetDouble(deal, DEAL_SL);
               positions[p].take_profit = HistoryDealGetDouble(deal, DEAL_TP);
            }

            // Weighted-average entry price across all opening deals.
            positions[p].entry_price_sum += price * volume;
            positions[p].entry_volume += volume;
         }
         else if(entry == DEAL_ENTRY_INOUT)
         {
            // A reversal cannot be represented safely as one simple TradeVault
            // position because it contains both closing and opening activity.
            positions[p].has_reversal = true;
         }
         else if(entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_OUT_BY)
         {
            positions[p].exit_price_sum += price * volume;
            positions[p].exit_volume += volume;

            if(deal_time > positions[p].closed_at)
               positions[p].closed_at = deal_time;

            if(entry == DEAL_ENTRY_OUT_BY)
               positions[p].has_exit_by = true;
         }
      }

      if(positions[p].has_reversal)
      {
         skipped_complex++;
         Print("TradeVault: skipping complex reversal position ",
               IntegerToString((long)position_id),
               " rather than creating an inaccurate journal record.");
         continue;
      }

      if(!positions[p].has_entry ||
         positions[p].entry_volume <= 0 ||
         positions[p].exit_volume <= 0 ||
         positions[p].closed_at == 0 ||
         positions[p].entry_price_sum <= 0)
      {
         skipped_incomplete++;
         Print("TradeVault: skipping incomplete position ",
               IntegerToString((long)position_id));
         continue;
      }

      double weighted_entry = positions[p].entry_price_sum / positions[p].entry_volume;
      double weighted_exit = positions[p].exit_price_sum / positions[p].exit_volume;

      string strategy = "MT5";
      if(positions[p].magic != 0)
         strategy = "MT5 Magic " + IntegerToString(positions[p].magic);

      if(positions[p].comment != "")
         strategy += " | " + positions[p].comment;

      string notes = "MT5 position " + IntegerToString((long)position_id);
      if(positions[p].has_exit_by)
         notes += " | close-by";

      if(synced_count > 0)
         trades += ",";

      trades += "{";
      trades += "\"externalId\":\"position:" + IntegerToString((long)position_id) + "\",";
      trades += "\"positionId\":\"" + IntegerToString((long)position_id) + "\",";
      trades += "\"symbol\":\"" + JsonEscape(positions[p].symbol) + "\",";
      trades += "\"side\":\"" + Side(positions[p].entry_type) + "\",";
      trades += "\"pnl\":" + DoubleToString(positions[p].pnl, 8) + ",";
      trades += "\"entryPrice\":" + DoubleToString(weighted_entry, 8) + ",";
      trades += "\"exitPrice\":" + DoubleToString(weighted_exit, 8) + ",";
      trades += "\"volume\":" + DoubleToString(positions[p].entry_volume, 4) + ",";
      trades += "\"stopLoss\":" + DoubleToString(positions[p].stop_loss, 8) + ",";
      trades += "\"takeProfit\":" + DoubleToString(positions[p].take_profit, 8) + ",";
      trades += "\"strategy\":\"" + JsonEscape(strategy) + "\",";
      trades += "\"notes\":\"" + JsonEscape(notes) + "\",";
      trades += "\"openedAt\":\"" + IsoTime(positions[p].opened_at) + "\",";
      trades += "\"closedAt\":\"" + IsoTime(positions[p].closed_at) + "\"";
      trades += "}";

      synced_count++;
   }

   if(synced_count == 0)
   {
      Print("TradeVault: no complete non-reversal positions ready to sync. ",
            "Skipped complex=", skipped_complex,
            ", incomplete=", skipped_incomplete);
      return;
   }

   string body = "{\"accountId\":\"" +
                 JsonEscape(TradeVaultAccountId) +
                 "\",\"trades\":[" + trades + "]}";

   SendToTradeVault(body);
}

void SendToTradeVault(string body)
{
   char data[];
   char result[];
   string result_headers;

   StringToCharArray(body, data, 0, StringLen(body), CP_UTF8);

   string headers =
      "Content-Type: application/json\r\n" +
      "Authorization: Bearer " + SyncToken + "\r\n";

   ResetLastError();

   int status = WebRequest(
      "POST",
      SyncUrl,
      headers,
      15000,
      data,
      result,
      result_headers
   );

   if(status == -1)
   {
      Print("TradeVault: WebRequest failed. Error=", GetLastError(),
            ". Add the SyncUrl domain to MT5 WebRequest allowed URLs.");
      return;
   }

   string response = CharArrayToString(result);

   if(status < 200 || status >= 300)
   {
      Print("TradeVault: HTTP ", status, " response=", response);
      return;
   }

   Print("TradeVault: sync successful. HTTP ", status,
         " response=", response);
}
