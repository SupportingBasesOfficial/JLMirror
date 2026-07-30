import "@repo/tailwind-config/globals.css";
import { Toaster } from "@repo/ui";

import { ThemeProvider } from "@/components/theme-provider";
import { WebVitalsReporter } from "./web-vitals";

export const metadata = {
  title: {
    default: "JLMIRROR",
    template: "%s — JLMIRROR",
  },
  description:
    "JLMIRROR — Portal de Monitoramento Multi-tenant",
  applicationName: "JLMIRROR",
  authors: [{ name: "JL Informatica" }],
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
  keywords: [
    "monorepo",
    "turborepo",
    "next.js",
    "hono",
    "postgresql",
    "typescript",
    "monitoring",
  ],
  openGraph: {
    type: "website",
    locale: "pt_BR",
    title: "JLMIRROR",
    description: "Portal de Monitoramento Multi-tenant",
    siteName: "JLMIRROR",
  },
  twitter: {
    card: "summary_large_image",
    title: "JLMIRROR",
    description: "Portal de Monitoramento Multi-tenant",
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
        </ThemeProvider>
      </body>
    </html>
  );
}
