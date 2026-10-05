#property strict
#property version   "1.0"
#property description "TradeVault read-only MT5 history synchronizer"

input string SyncUrl = "https://YOUR-TRADEVAULT-DOMAIN.vercel.app/api/trades/sync/mt5";
input string SyncToken = "CHANGE_ME";
input string TradeVaultAccountId = "YOUR_ACCOUNT_ID";
input int LookbackDays = 30;
input int SyncIntervalSeconds = 60;

struct PositionSummary
{
   ulong position_id;
   string symbol;
   long type;
   double entry_price;
   double exit_price;
   double volume;
   double stop_loss;
   double take_profit;
   double pnl;
   datetime opened_at;
   datetime closed_at;
   long magic;
   string comment;
};

string JsonEscape(string value)
{
   StringReplace(value, "\\", "\\\\");
   StringReplace(value, """, "\\"");
   StringReplace(value, "\r", "\\r");
   StringReplace(value, "\n", "\\n");
   return value;
}

string IsoTime(datetime value)
{
   return TimeToString(value, TIME_DATE | TIME_SECONDS);
}

string Side(long deal_type)
{
   return deal_type == DEAL_TYPE_SELL ? "SHORT" : "LONG";
}

int OnInit()
{
   if(SyncIntervalSeconds < 10)
      EventSetTimer(10);
   else
      EventSetTimer(SyncIntervalSeconds);

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

void SyncClosedPositions()
{
   datetime from = TimeCurrent() - (LookbackDays * 86400);
   datetime to = TimeCurrent();

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

      int index = -1;
      for(int p = 0; p < position_count; p++)
      {
         if(positions[p].position_id == position_id)
         {
            index = p;
            break;
         }
      }

      if(index < 0)
      {
         ArrayResize(positions, position_count + 1);
         index = position_count++;
         ZeroMemory(positions[index]);
         positions[index].position_id = position_id;
         positions[index].symbol = HistoryDealGetString(deal, DEAL_SYMBOL);
         positions[index].exit_price = 0.0;
         positions[index].volume = 0.0;
         positions[index].pnl = 0.0;
         positions[index].closed_at = 0;
      }

      double volume = HistoryDealGetDouble(deal, DEAL_VOLUME);
      double price = HistoryDealGetDouble(deal, DEAL_PRICE);
      double profit = HistoryDealGetDouble(deal, DEAL_PROFIT);
      double commission = HistoryDealGetDouble(deal, DEAL_COMMISSION);
      double swap = HistoryDealGetDouble(deal, DEAL_SWAP);
      datetime deal_time = (datetime)HistoryDealGetInteger(deal, DEAL_TIME);

      positions[index].exit_price += price * volume;
      positions[index].volume += volume;
      positions[index].pnl += profit + commission + swap;

      if(deal_time > positions[index].closed_at)
         positions[index].closed_at = deal_time;

      if(positions[index].comment == "")
         positions[index].comment = HistoryDealGetString(deal, DEAL_COMMENT);

      if(positions[index].magic == 0)
         positions[index].magic = HistoryDealGetInteger(deal, DEAL_MAGIC);
   }

   string trades = "";
   int synced_count = 0;

   for(int p = 0; p < position_count; p++)
   {
      ulong position_id = positions[p].position_id;
      if(position_id == 0 || positions[p].closed_at == 0 || positions[p].volume <= 0)
         continue;

      double weighted_exit = positions[p].exit_price / positions[p].volume;

      // Find the original opening deal for this position.
      datetime opened_at = 0;
      double entry_price = 0.0;
      double entry_volume = 0.0;
      long entry_type = DEAL_TYPE_BUY;
      double stop_loss = 0.0;
      double take_profit = 0.0;
      long magic = positions[p].magic;
      string comment = positions[p].comment;

      int deals = HistoryDealsTotal();
      for(int i = 0; i < deals; i++)
      {
         ulong deal = HistoryDealGetTicket(i);
         if(deal == 0)
            continue;

         if((ulong)HistoryDealGetInteger(deal, DEAL_POSITION_ID) != position_id)
            continue;

         ENUM_DEAL_ENTRY entry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(deal, DEAL_ENTRY);
         if(entry != DEAL_ENTRY_IN)
            continue;

         datetime deal_time = (datetime)HistoryDealGetInteger(deal, DEAL_TIME);
         entry_type = HistoryDealGetInteger(deal, DEAL_TYPE);
         entry_price = HistoryDealGetDouble(deal, DEAL_PRICE);
         entry_volume = HistoryDealGetDouble(deal, DEAL_VOLUME);
         stop_loss = HistoryDealGetDouble(deal, DEAL_SL);
         take_profit = HistoryDealGetDouble(deal, DEAL_TP);
         magic = HistoryDealGetInteger(deal, DEAL_MAGIC);
         comment = HistoryDealGetString(deal, DEAL_COMMENT);

         if(opened_at == 0 || deal_time < opened_at)
            opened_at = deal_time;
      }

      if(opened_at == 0 || entry_price <= 0)
         continue;

      string strategy = "MT5";
      if(magic != 0)
         strategy = "MT5 Magic " + IntegerToString(magic);

      if(comment != "")
         strategy += " | " + comment;

      if(synced_count > 0)
         trades += ",";

      trades += "{";
      trades += "\"externalId\":\"position:" + IntegerToString((long)position_id) + "\",";
      trades += "\"positionId\":\"" + IntegerToString((long)position_id) + "\",";
      trades += "\"symbol\":\"" + JsonEscape(positions[p].symbol) + "\",";
      trades += "\"side\":\"" + Side(entry_type) + "\",";
      trades += "\"pnl\":" + DoubleToString(positions[p].pnl, 8) + ",";
      trades += "\"entryPrice\":" + DoubleToString(entry_price, 8) + ",";
      trades += "\"exitPrice\":" + DoubleToString(weighted_exit, 8) + ",";
      trades += "\"volume\":" + DoubleToString(entry_volume > 0 ? entry_volume : positions[p].volume, 4) + ",";
      trades += "\"stopLoss\":" + DoubleToString(stop_loss, 8) + ",";
      trades += "\"takeProfit\":" + DoubleToString(take_profit, 8) + ",";
      trades += "\"strategy\":\"" + JsonEscape(strategy) + "\",";
      trades += "\"notes\":\"MT5 position " + IntegerToString((long)position_id) + "\",";
      trades += "\"openedAt\":\"" + IsoTime(opened_at) + "\",";
      trades += "\"closedAt\":\"" + IsoTime(positions[p].closed_at) + "\"";
      trades += "}";

      synced_count++;
   }

   if(synced_count == 0)
      return;

   string body = "{\"accountId\":\"" + JsonEscape(TradeVaultAccountId) + "\",\"trades\":[" + trades + "]}";
   SendToTradeVault(body);
}

void SendToTradeVault(string body)
{
   char data[];
   char result[];
   string result_headers;

   StringToCharArray(body, data, 0, StringLen(body), CP_UTF8);

   string headers = "Content-Type: application/json\r\nAuthorization: Bearer " + SyncToken + "\r\n";
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

   if(status < 200 || status >= 300)
   {
      Print("TradeVault: HTTP ", status, " response=", CharArrayToString(result));
      return;
   }

   Print("TradeVault: sync successful. HTTP ", status,
         " response=", CharArrayToString(result));
}
