// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import "@repo/tailwind-config/globals.css";
import { Toaster } from "@repo/ui";

import { ThemeProvider } from "@/components/theme-provider";
import { WebVitalsReporter } from "./web-vitals";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";
import { ServiceWorkerRegister } from "@/components/sw-register";

export const metadata = {
  title: {
    default: "Portal JL — JL Informática",
    template: "%s — Portal JL",
  },
  description:
    "Portal JL — Soluções de Tecnologia para Empresas. Observabilidade, gestão, segurança e nuvem pela JL Informática.",
  applicationName: "Portal JL",
  authors: [{ name: "JL Informática" }],
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
  keywords: [
    "JL Informática",
    "Portal JL",
    "JLMirror",
    "monitoramento",
    "observabilidade",
    "infraestrutura",
    "tecnologia",
    "segurança",
    "LGPD",
    "nuvem",
    "DevOps",
  ],
  openGraph: {
    type: "website",
    locale: "pt_BR",
    title: "Portal JL — Soluções de Tecnologia para Empresas",
    description:
      "Da observabilidade de infraestrutura à gestão empresarial integrada. Tecnologia que impulsiona.",
    siteName: "Portal JL",
  },
  twitter: {
    card: "summary_large_image",
    title: "Portal JL — JL Informática",
    description: "Soluções de Tecnologia para Empresas que Crescem",
  },
  robots: {
    index: true,
    follow: true,
  },
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
          <WebVitalsReporter />
          <PwaInstallPrompt />
          <ServiceWorkerRegister />
        </ThemeProvider>
      </body>
    </html>
  );
}
