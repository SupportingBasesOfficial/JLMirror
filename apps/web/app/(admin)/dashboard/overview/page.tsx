// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { redirect } from "next/navigation";

// KPIs já estão consolidados em /dashboard via DashboardOverviewWrapper
export default function DashboardOverview() {
  redirect("/dashboard");
}
