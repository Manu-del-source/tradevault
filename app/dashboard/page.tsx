import TradeVaultDashboard from "@/components/tradevault-dashboard";
import { getCurrentUser } from "@/lib/auth";
import { hasActivePro } from "@/lib/subscription";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const isAdmin = user?.role === "ADMIN";
  const isPro = !!user && (isAdmin || await hasActivePro(user.id));
  return <TradeVaultDashboard isAdmin={isAdmin} isPro={isPro} />;
}
