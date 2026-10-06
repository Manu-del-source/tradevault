#property copyright "TradeVault"
#property version   "1.0"
#property description "Read-only TradeVault MT5 journal bridge"

input string TradeVaultURL = "https://vault.smartbiz365.site/api/mt5/ingest";
input string SyncToken = "";
input int    SyncIntervalSeconds = 60;
input int    HistoryDays = 30;
input int    MaxDealsPerSync = 200;

datetime g_lastSync = 0;

string JsonEscape(string value)
{
   StringReplace(value, "\\", "\\\\");
   StringReplace(value, """, "\\"");
   StringReplace(value, "\r", "\\r");
   StringReplace(value, "\n", "\\n");
   return value;
}

string UnixSeconds(datetime value)
{
   return IntegerToString((long)value);
}

bool SendDeal(ulong ticket)
{
   long entry = HistoryDealGetInteger(ticket, DEAL_ENTRY);
   if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_OUT_BY && entry != DEAL_ENTRY_INOUT)
      return true;

   long dealType = HistoryDealGetInteger(ticket, DEAL_TYPE);
   if(dealType != DEAL_TYPE_BUY && dealType != DEAL_TYPE_SELL)
      return true;

   string symbol = HistoryDealGetString(ticket, DEAL_SYMBOL);
   if(symbol == "")
      return true;

   long positionId = HistoryDealGetInteger(ticket, DEAL_POSITION_ID);
   double exitPrice = HistoryDealGetDouble(ticket, DEAL_PRICE);
   double volume = HistoryDealGetDouble(ticket, DEAL_VOLUME);
   double profit = HistoryDealGetDouble(ticket, DEAL_PROFIT);
   double commission = HistoryDealGetDouble(ticket, DEAL_COMMISSION);
   double swap = HistoryDealGetDouble(ticket, DEAL_SWAP);
   datetime closeTime = (datetime)HistoryDealGetInteger(ticket, DEAL_TIME);

   // A closing SELL means the original position was LONG.
   // A closing BUY means the original position was SHORT.
   string side = dealType == DEAL_TYPE_SELL ? "LONG" : "SHORT";

   double entryPrice = 0.0;
   datetime openTime = closeTime;

   // Reconstruct the opening side of this position from its position history.
   if(positionId > 0 && HistorySelectByPosition((ulong)positionId))
   {
      int total = HistoryDealsTotal();
      double entryVolume = 0.0;
      double weightedEntry = 0.0;

      for(int i = 0; i < total; i++)
      {
         ulong t = HistoryDealGetTicket(i);
         if(t == 0 || t == ticket)
            continue;

         long e = HistoryDealGetInteger(t, DEAL_ENTRY);
         long type = HistoryDealGetInteger(t, DEAL_TYPE);

         bool isOpening = (side == "LONG" && type == DEAL_TYPE_BUY && (e == DEAL_ENTRY_IN || e == DEAL_ENTRY_INOUT))
                       || (side == "SHORT" && type == DEAL_TYPE_SELL && (e == DEAL_ENTRY_IN || e == DEAL_ENTRY_INOUT));

         if(isOpening)
         {
            double v = HistoryDealGetDouble(t, DEAL_VOLUME);
            double p = HistoryDealGetDouble(t, DEAL_PRICE);
            weightedEntry += p * v;
            entryVolume += v;

            datetime ttime = (datetime)HistoryDealGetInteger(t, DEAL_TIME);
            if(ttime < openTime)
               openTime = ttime;
         }
      }

      if(entryVolume > 0.0)
         entryPrice = weightedEntry / entryVolume;
   }

   double pnl = profit + commission + swap;
   string accountLogin = IntegerToString((long)AccountInfoInteger(ACCOUNT_LOGIN));
   string comment = JsonEscape(HistoryDealGetString(ticket, DEAL_COMMENT));

   string json = StringFormat(
      "{\"accountLogin\":\"%s\",\"dealTicket\":\"%I64u\",\"positionId\":\"%I64d\",\"symbol\":\"%s\",\"side\":\"%s\",\"volume\":%.8f,\"entryPrice\":%.8f,\"exitPrice\":%.8f,\"pnl\":%.8f,\"openedAt\":%s,\"closedAt\":%s,\"comment\":\"%s\"}",
      accountLogin,
      ticket,
      positionId,
      JsonEscape(symbol),
      side,
      volume,
      entryPrice,
      exitPrice,
      pnl,
      UnixSeconds(openTime),
      UnixSeconds(closeTime),
      comment
   );

   char data[];
   StringToCharArray(json, data, 0, StringLen(json), CP_UTF8);

   char result[];
   string responseHeaders;
   string headers = "Content-Type: application/json\r\nAuthorization: Bearer " + SyncToken + "\r\n";

   ResetLastError();
   int code = WebRequest("POST", TradeVaultURL, headers, 15000, data, result, responseHeaders);

   if(code == 200)
      return true;

   PrintFormat("TradeVault sync failed for deal %I64u. HTTP=%d error=%d response=%s",
               ticket, code, GetLastError(), CharArrayToString(result));
   return false;
}

void SyncHistory()
{
   if(StringLen(SyncToken) < 20)
   {
      Print("TradeVault: SyncToken is not configured.");
      return;
   }

   datetime to = TimeCurrent();
   datetime from = to - HistoryDays * 86400;

   ResetLastError();
   if(!HistorySelect(from, to))
   {
      PrintFormat("TradeVault: HistorySelect failed. Error=%d", GetLastError());
      return;
   }

   int total = HistoryDealsTotal();
   int start = total - MaxDealsPerSync;
   if(start < 0)
      start = 0;

   int sent = 0;
   for(int i = start; i < total; i++)
   {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0)
         continue;

      if(SendDeal(ticket))
         sent++;
   }

   g_lastSync = TimeCurrent();
   PrintFormat("TradeVault: sync finished. Deals checked=%d sent=%d", total - start, sent);
}

int OnInit()
{
   if(StringLen(SyncToken) < 20)
   {
      Print("TradeVault: enter the SyncToken in EA inputs.");
      return INIT_PARAMETERS_INCORRECT;
   }

   if(SyncIntervalSeconds < 15)
      SyncIntervalSeconds = 15;

   EventSetTimer(SyncIntervalSeconds);
   SyncHistory();
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
}

void OnTimer()
{
   SyncHistory();
}
