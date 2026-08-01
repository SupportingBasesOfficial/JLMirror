import { redirect } from "next/navigation";

// KPIs já estão consolidados em /dashboard via DashboardOverviewWrapper
export default function DashboardOverview() {
  redirect("/dashboard");
}
