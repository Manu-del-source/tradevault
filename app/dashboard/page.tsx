import TradeVaultDashboard from "@/components/tradevault-dashboard";
import { getCurrentUser } from "@/lib/auth";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  return <TradeVaultDashboard isAdmin={user?.role === "ADMIN"} />;
}
