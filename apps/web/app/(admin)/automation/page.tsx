import { redirect } from "next/navigation";

// Pagina index de Automation redireciona para scripts
export default function AutomationPage() {
  redirect("/automation/scripts");
}
