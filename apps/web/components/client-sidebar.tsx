"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, PanelLeftClose, PanelLeftOpen, Search, X, Menu } from "lucide-react";
import { LogoutButton } from "@/components/logout-button";
import { ZabbixPingIndicator } from "@/components/zabbix-ping-indicator";
import { useModuleFlags } from "@/lib/use-module-flags";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  flagKey?: string;
  external?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

function isActive(pathname: string | null, item: NavItem): boolean {
  if (!pathname) return false;
  if (item.href === "/dashboard") return pathname === "/dashboard" || pathname.startsWith("/dashboard/devices") || pathname.startsWith("/dashboard/problems") || pathname.startsWith("/dashboard/events") || pathname.startsWith("/dashboard/graphs") || pathname.startsWith("/dashboard/host-groups") || pathname.startsWith("/dashboard/templates") || pathname.startsWith("/dashboard/triggers");
  return pathname === item.href;
}

function sectionHasActive(section: NavSection, pathname: string | null): boolean {
  return section.items.some((item) => isActive(pathname, item));
}

const CLIENT_NAV_SECTIONS: NavSection[] = [
  {
    title: "Monitoramento",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg> },
      { label: "Problemas", href: "/dashboard/problems", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg> },
      { label: "Eventos", href: "/dashboard/events", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg> },
      { label: "Dispositivos", href: "/dashboard/devices", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg> },
      { label: "Gráficos", href: "/dashboard/graphs", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg> },
    ],
  },
  {
    title: "Operações",
    items: [
      { label: "Tickets", href: "/tickets", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/></svg>, flagKey: "module_tickets" },
      { label: "Base de Conhecimento", href: "/knowledge-base", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>, flagKey: "module_kb" },
      { label: "SLA Dashboard", href: "/sla-dashboard", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4"/><path d="m6 6 3 3"/><path d="M18 6l-3 3"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M12 18v4"/><path d="m6 18 3-3"/><path d="m18 18-3-3"/><circle cx="12" cy="12" r="2"/></svg> },
      { label: "Health Score", href: "/health-score", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg> },
    ],
  },
  {
    title: "Conta",
    items: [
      { label: "Meu Perfil", href: "/profile", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>, flagKey: "module_profile" },
      { label: "Sessões & Segurança", href: "/sessions", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1Z"/></svg>, flagKey: "module_auth" },
    ],
  },
];

function LogoMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className="shrink-0">
      <path d="M8 22V10M8 10L14 16M8 10L2 16" stroke="var(--brand-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" transform="translate(4 0)" />
      <path d="M20 10V22M20 22L26 16M20 22L14 16" stroke="var(--brand-secondary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" transform="translate(-2 0)" />
      <circle cx="16" cy="16" r="2" fill="var(--brand-primary)" />
    </svg>
  );
}

export function ClientSidebar() {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState("");
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  const { isModuleEnabled } = useModuleFlags();

  const sidebarWidth = collapsed ? "w-16" : "w-64";

  const filteredSections = useMemo(() => {
    const flagFiltered = CLIENT_NAV_SECTIONS.map((section) => ({
      ...section,
      items: section.items.filter((item) =>
        !item.flagKey || isModuleEnabled(item.flagKey),
      ),
    })).filter((section) => section.items.length > 0);

    if (!query.trim()) return flagFiltered;
    const q = query.toLowerCase();
    return flagFiltered.map((section) => ({
      ...section,
      items: section.items.filter((item) => item.label.toLowerCase().includes(q)),
    })).filter((section) => section.items.length > 0);
  }, [query, isModuleEnabled]);

  const isSearching = query.trim().length > 0;

  function toggleSection(title: string) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

  function isSectionExpanded(section: NavSection): boolean {
    if (isSearching) return true;
    if (sectionHasActive(section, pathname)) return true;
    return !collapsedSections.has(section.title);
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed top-3 left-3 z-50 rounded-lg p-2 transition-colors md:hidden"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border-default)",
          color: "var(--text-primary)",
        }}
        aria-label="Toggle sidebar"
      >
        {open ? <X size={18} /> : <Menu size={18} />}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-30 md:hidden"
          style={{ background: "rgba(0,0,0,0.6)" }}
          role="button"
          tabIndex={0}
          aria-label="Fechar menu"
          onClick={() => setOpen(false)}
          onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
        />
      )}

      <aside
        className={`fixed md:sticky md:top-0 z-40 ${sidebarWidth} flex flex-col shrink-0 transition-all duration-300 h-screen ${open ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
        style={{
          borderRight: "1px solid var(--border-subtle)",
          background: "var(--surface-1)",
        }}
      >
        <div className={`flex items-center justify-between ${collapsed ? "px-2" : "px-4"} pt-5 pb-3`}>
          <div className={`flex items-center gap-2.5 ${collapsed ? "md:hidden" : ""}`}>
            <div className="relative">
              <div
                className="absolute inset-0 rounded-lg"
                style={{
                  background: "radial-gradient(circle, var(--brand-glow) 0%, transparent 70%)",
                  filter: "blur(4px)",
                }}
              />
              <div className="relative">
                <LogoMark size={26} />
              </div>
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold tracking-tight" style={{ color: "var(--brand-primary)" }}>JLMIRROR</h2>
              <p className="text-[10px] truncate tracking-wide" style={{ color: "var(--text-muted)" }}>Portal do Cliente</p>
            </div>
          </div>

          <div className={`hidden md:flex items-center justify-center ${collapsed ? "" : "md:hidden"}`}>
            <LogoMark size={26} />
          </div>

          <button
            onClick={() => setCollapsed((v) => !v)}
            className="hidden md:flex items-center justify-center rounded-lg p-1.5 transition-all shrink-0 hover:scale-105"
            style={{
              background: collapsed ? "var(--brand-glow)" : "transparent",
              border: "1px solid var(--border-default)",
              color: collapsed ? "var(--brand-primary)" : "var(--text-muted)",
              cursor: "pointer",
            }}
            aria-label={collapsed ? "Expandir sidebar" : "Recolher sidebar"}
            title={collapsed ? "Expandir" : "Recolher"}
          >
            {collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
          </button>
        </div>

        {!collapsed && (
          <div className="px-3 pb-3">
            <div
              className="relative flex items-center rounded-lg transition-all"
              style={{
                background: "var(--surface-0)",
                border: "1px solid var(--border-default)",
              }}
            >
              <Search
                size={14}
                className="absolute left-2.5 shrink-0 pointer-events-none"
                style={{ color: "var(--text-muted)" }}
              />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar..."
                className="w-full bg-transparent pl-8 pr-7 py-2 text-xs font-medium outline-none"
                style={{ color: "var(--text-primary)" }}
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="absolute right-1.5 rounded p-0.5 transition-colors"
                  style={{ color: "var(--text-muted)" }}
                  aria-label="Limpar busca"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 pb-2 sidebar-nav-scroll">
          {filteredSections.length === 0 && (
            <div className="px-3 py-8 text-center text-xs" style={{ color: "var(--text-muted)" }}>
              Nenhum resultado para "{query}"
            </div>
          )}
          {filteredSections.map((section) => {
            const expanded = isSectionExpanded(section);
            const hasActive = sectionHasActive(section, pathname);
            return (
              <div key={section.title} className="mb-1">
                {!collapsed && (
                  <button
                    onClick={() => toggleSection(section.title)}
                    className="flex items-center justify-between w-full px-3 pt-3 pb-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors group"
                    style={{ color: hasActive ? "var(--brand-secondary)" : "var(--text-muted)" }}
                  >
                    <span>{section.title}</span>
                    <ChevronDown
                      size={12}
                      className="shrink-0 transition-transform duration-200"
                      style={{ transform: expanded ? "rotate(0deg)" : "rotate(-90deg)" }}
                    />
                  </button>
                )}

                {collapsed && (
                  <div className="pt-3 pb-1 flex justify-center">
                    <div
                      className="h-px w-6"
                      style={{ background: "var(--border-default)" }}
                    />
                  </div>
                )}

                <div
                  className="space-y-0.5 overflow-hidden transition-all duration-200"
                  style={{
                    maxHeight: expanded ? "1000px" : "0px",
                    opacity: expanded ? 1 : 0,
                  }}
                >
                  {section.items.map((item) => {
                    const active = isActive(pathname, item);
                    return (
                      <Link
                        key={item.label}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150 no-underline group/item"
                        style={{
                          color: active ? "var(--brand-primary)" : "var(--text-secondary)",
                          background: active ? "var(--brand-glow)" : "transparent",
                          textDecoration: "none",
                          justifyContent: collapsed ? "center" : "flex-start",
                          position: "relative",
                        }}
                        title={collapsed ? item.label : undefined}
                      >
                        {active && !collapsed && (
                          <span
                            className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full"
                            style={{
                              background: "linear-gradient(180deg, var(--brand-secondary), var(--brand-primary))",
                              boxShadow: "0 0 8px var(--brand-glow)",
                            }}
                          />
                        )}
                        <span
                          className="shrink-0 transition-transform duration-150 group-hover/item:scale-110"
                          style={{ filter: active ? "drop-shadow(0 0 4px var(--brand-glow))" : "none" }}
                        >
                          {item.icon}
                        </span>
                        <span className={collapsed ? "md:hidden" : "truncate"}>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="px-3 pt-3 pb-3 space-y-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <div className={`flex items-center gap-2.5 ${collapsed ? "md:hidden" : ""}`}>
            <div
              className="relative flex items-center justify-center rounded-full shrink-0"
              style={{ width: 34, height: 34, background: "var(--brand-glow)", border: "1px solid var(--brand-primary)" }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--brand-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span
                className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full"
                style={{
                  background: "var(--status-ok-text)",
                  border: "2px solid var(--surface-1)",
                }}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                Usuário
              </div>
              <div className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>
                Cliente
              </div>
            </div>
          </div>

          <ZabbixPingIndicator collapsed={collapsed} />
          <LogoutButton collapsed={collapsed} />
        </div>
      </aside>
    </>
  );
}
