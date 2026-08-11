// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  X,
  Menu,
} from "lucide-react";
import { LogoutButton } from "@/components/logout-button";
import { ZabbixPingIndicator } from "@/components/zabbix-ping-indicator";
import { useModuleFlags } from "@/lib/use-module-flags";
import { useUserRoles } from "@/lib/use-user-roles";
import { useSidebarBadges } from "@/lib/use-sidebar-badges";
import {
  SIDEBAR_MODULES,
  SIDEBAR_FOOTER_ITEMS,
  type SidebarItem,
  type SidebarCategory,
  type SidebarModule,
  type SidebarRole,
  type BadgeKey,
} from "@/lib/sidebar-config";

// --- Helpers ---

function hasRole(itemRoles: SidebarRole[], userRoles: SidebarRole[]): boolean {
  return itemRoles.some((r) => userRoles.includes(r));
}

function isActive(pathname: string | null, item: SidebarItem): boolean {
  if (!pathname || !item.path || item.external) return false;
  if (item.prefixMatch) return pathname.startsWith(item.path);
  return pathname === item.path;
}

function categoryHasActive(
  category: SidebarCategory,
  pathname: string | null,
): boolean {
  return category.items.some((item) => isActive(pathname, item));
}

function moduleHasActive(
  module: SidebarModule,
  pathname: string | null,
): boolean {
  return module.categories.some((cat) => categoryHasActive(cat, pathname));
}

// --- Logo ---

function LogoMark({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className="shrink-0"
    >
      <path
        d="M8 22V10M8 10L14 16M8 10L2 16"
        stroke="var(--brand-primary)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(4 0)"
      />
      <path
        d="M20 10V22M20 22L26 16M20 22L14 16"
        stroke="var(--brand-secondary)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(-2 0)"
      />
      <circle cx="16" cy="16" r="2" fill="var(--brand-primary)" />
    </svg>
  );
}

// --- Badge ---

function BadgeCounter({
  count,
  severity,
}: {
  count: number;
  severity?: "critical" | "warning" | "info";
}) {
  if (count <= 0) return null;
  const display = count > 99 ? "99+" : String(count);
  const colorMap = {
    critical: "var(--status-error-text)",
    warning: "var(--status-warning-text)",
    info: "var(--brand-primary)",
  };
  const bgMap = {
    critical: "var(--status-error-bg)",
    warning: "var(--status-warning-bg)",
    info: "var(--brand-glow)",
  };
  const color = severity ? colorMap[severity] : "var(--brand-primary)";
  const bg = severity ? bgMap[severity] : "var(--brand-glow)";
  return (
    <span
      className="ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums leading-none"
      style={{
        color,
        background: bg,
        minWidth: 18,
        textAlign: "center",
      }}
    >
      {display}
    </span>
  );
}

function getBadgeCount(
  badgeKey: BadgeKey,
  badges: ReturnType<typeof useSidebarBadges>["badges"],
): { count: number; severity?: "critical" | "warning" | "info" } {
  if (!badgeKey) return { count: 0 };
  if (badgeKey === "incidents") {
    const { total, bySeverity } = badges.incidents;
    const severity =
      bySeverity.disaster + bySeverity.critical > 0
        ? "critical"
        : bySeverity.high + bySeverity.warning > 0
          ? "warning"
          : "info";
    return { count: total, severity };
  }
  if (badgeKey === "tickets") {
    return {
      count: badges.tickets,
      severity: badges.tickets > 0 ? "warning" : "info",
    };
  }
  if (badgeKey === "tasks") {
    return { count: badges.tasks, severity: "info" };
  }
  return { count: 0 };
}

// --- Nav Item (folha) ---

function NavItemRow({
  item,
  active,
  collapsed,
  onNavigate,
  badgeCount,
  depth,
}: {
  item: SidebarItem;
  active: boolean;
  collapsed: boolean;
  onNavigate: () => void;
  badgeCount?: { count: number; severity?: "critical" | "warning" | "info" };
  depth: number;
}) {
  const linkStyle: React.CSSProperties = {
    color: active
      ? "var(--brand-primary)"
      : item.external
        ? "var(--text-muted)"
        : "var(--text-secondary)",
    background: active ? "var(--brand-glow)" : "transparent",
    textDecoration: "none",
    justifyContent: collapsed ? "center" : "flex-start",
    position: "relative",
    paddingLeft: collapsed ? undefined : 8 + depth * 12,
  };

  const className =
    "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] font-normal transition-all duration-150 no-underline group/item";

  const content = (
    <>
      {active && !collapsed && (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-4 rounded-r-full"
          style={{
            background:
              "linear-gradient(180deg, var(--brand-secondary), var(--brand-primary))",
            boxShadow: "0 0 8px var(--brand-glow)",
          }}
        />
      )}
      {/* Item icone menor e com opacidade reduzida para hierarquia visual */}
      <span
        className="shrink-0 transition-transform duration-150 group-hover/item:scale-110"
        style={{
          filter: active ? "drop-shadow(0 0 4px var(--brand-glow))" : "none",
          opacity: active ? 1 : 0.65,
          transform: "scale(0.85)",
        }}
      >
        {item.icon}
      </span>
      <span className={collapsed ? "md:hidden" : "truncate"}>{item.label}</span>
      {item.external && !collapsed && (
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="ml-auto shrink-0 opacity-50"
        >
          <path d="M7 17L17 7M17 7H8M17 7V16" />
        </svg>
      )}
      {badgeCount && !collapsed && badgeCount.count > 0 && (
        <BadgeCounter count={badgeCount.count} severity={badgeCount.severity} />
      )}
    </>
  );

  const hoverHandlers = {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      if (!active) {
        e.currentTarget.style.background = "var(--surface-hover)";
        e.currentTarget.style.color = "var(--text-primary)";
      }
    },
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
      if (!active) {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = item.external
          ? "var(--text-muted)"
          : "var(--text-secondary)";
      }
    },
  };

  if (collapsed) {
    return (
      <div className="relative group/collapsed-item flex justify-center">
        <Link
          href={item.path ?? "#"}
          target={item.external ? "_blank" : undefined}
          rel={item.external ? "noopener noreferrer" : undefined}
          className={className}
          style={linkStyle}
          onClick={onNavigate}
          {...hoverHandlers}
          title={item.label}
        >
          {content}
        </Link>
        <span
          className="pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium opacity-0 group-hover/collapsed-item:opacity-100 transition-opacity"
          style={{
            background: "var(--surface-3)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-default)",
          }}
        >
          {item.label}
        </span>
      </div>
    );
  }

  return (
    <Link
      href={item.path ?? "#"}
      target={item.external ? "_blank" : undefined}
      rel={item.external ? "noopener noreferrer" : undefined}
      className={className}
      style={linkStyle}
      onClick={onNavigate}
      {...hoverHandlers}
    >
      {content}
    </Link>
  );
}

// --- Category (nivel 2) ---

function CategorySection({
  category,
  pathname,
  isExpanded,
  onToggle,
  onNavigate,
  badges,
}: {
  category: SidebarCategory;
  pathname: string | null;
  isExpanded: boolean;
  onToggle: () => void;
  onNavigate: () => void;
  badges: ReturnType<typeof useSidebarBadges>["badges"];
}) {
  const hasActive = categoryHasActive(category, pathname);
  const badge = category.badgeKey
    ? getBadgeCount(category.badgeKey, badges)
    : null;

  return (
    <div className="mb-1 ml-2">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 w-full px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors group rounded-md"
        style={{
          color: hasActive ? "var(--brand-secondary)" : "var(--text-muted)",
          background: "transparent",
          borderLeft: hasActive
            ? "2px solid var(--brand-secondary)"
            : "2px solid transparent",
        }}
        onMouseEnter={(e) => {
          if (!hasActive) {
            e.currentTarget.style.background = "var(--surface-hover)";
            e.currentTarget.style.color = "var(--text-secondary)";
            e.currentTarget.style.borderLeftColor = "var(--border-strong)";
          }
        }}
        onMouseLeave={(e) => {
          if (!hasActive) {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--text-muted)";
            e.currentTarget.style.borderLeftColor = "transparent";
          }
        }}
      >
        {category.icon && (
          <span className="shrink-0" style={{ opacity: 0.6 }}>
            {category.icon}
          </span>
        )}
        <span className="truncate text-left flex-1">{category.label}</span>
        {badge && badge.count > 0 && (
          <BadgeCounter count={badge.count} severity={badge.severity} />
        )}
        <ChevronDown
          size={11}
          className="shrink-0 transition-transform duration-200"
          style={{
            transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)",
          }}
        />
      </button>
      <div
        className="overflow-hidden transition-all duration-200"
        style={{
          maxHeight: isExpanded ? "2000px" : "0px",
          opacity: isExpanded ? 1 : 0,
        }}
      >
        {/* Linha conectora vertical esquerda para agrupar itens da categoria */}
        <div
          className="ml-4 mt-0.5 mb-1 pl-2.5 space-y-0.5"
          style={{ borderLeft: "1px solid var(--border-subtle)" }}
        >
          {category.items.map((item) => {
            const active = isActive(pathname, item);
            const itemBadge = item.badgeKey
              ? getBadgeCount(item.badgeKey, badges)
              : undefined;
            return (
              <NavItemRow
                key={item.id}
                item={item}
                active={active}
                collapsed={false}
                onNavigate={onNavigate}
                badgeCount={itemBadge}
                depth={0}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// --- Module (nivel 1) — modo expandido ---

function ModuleSectionExpanded({
  module,
  pathname,
  isExpanded,
  isCategoryExpandedFn,
  onModuleToggle,
  onCategoryToggle,
  onNavigate,
  badges,
  isLast,
}: {
  module: SidebarModule;
  pathname: string | null;
  isExpanded: boolean;
  isCategoryExpandedFn: (cat: SidebarCategory) => boolean;
  onModuleToggle: () => void;
  onCategoryToggle: (categoryId: string) => void;
  onNavigate: () => void;
  badges: ReturnType<typeof useSidebarBadges>["badges"];
  isLast: boolean;
}) {
  const hasActive = moduleHasActive(module, pathname);

  return (
    <div
      className="mb-1"
      style={{
        borderBottom: isLast ? "none" : "1px solid var(--border-subtle)",
        paddingBottom: isLast ? 0 : 4,
      }}
    >
      <button
        onClick={onModuleToggle}
        className="flex items-center gap-2.5 w-full px-2.5 py-2 text-[13px] font-bold transition-colors group rounded-lg"
        style={{
          color: hasActive ? "var(--brand-primary)" : "var(--text-primary)",
          background: hasActive ? "var(--brand-glow)" : "transparent",
        }}
        onMouseEnter={(e) => {
          if (!hasActive) {
            e.currentTarget.style.background = "var(--surface-hover)";
          }
        }}
        onMouseLeave={(e) => {
          if (!hasActive) {
            e.currentTarget.style.background = "transparent";
          }
        }}
      >
        {/* Container do icone do modulo — destacado visualmente */}
        <span
          className="shrink-0 flex items-center justify-center rounded-md transition-all duration-150 group-hover:scale-105"
          style={{
            width: 28,
            height: 28,
            background: hasActive ? "var(--brand-glow)" : "var(--surface-2)",
            border: hasActive
              ? "1px solid var(--brand-border)"
              : "1px solid var(--border-subtle)",
            filter: hasActive
              ? "drop-shadow(0 0 4px var(--brand-glow))"
              : "none",
          }}
        >
          {module.icon}
        </span>
        <span className="truncate text-left flex-1">{module.sectionTitle}</span>
        <ChevronDown
          size={14}
          className="shrink-0 transition-transform duration-200"
          style={{
            transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)",
            color: "var(--text-muted)",
          }}
        />
      </button>
      <div
        className="overflow-hidden transition-all duration-200"
        style={{
          maxHeight: isExpanded ? "4000px" : "0px",
          opacity: isExpanded ? 1 : 0,
        }}
      >
        <div className="pt-1 pb-1">
          {module.categories.map((cat) => (
            <CategorySection
              key={cat.id}
              category={cat}
              pathname={pathname}
              isExpanded={isCategoryExpandedFn(cat)}
              onToggle={() => onCategoryToggle(cat.id)}
              onNavigate={onNavigate}
              badges={badges}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Module (nivel 1) — modo collapsed com popover hover ---

function ModuleSectionCollapsed({
  module,
  pathname,
  onNavigate,
  badges,
  isLast,
  isHovered,
  onHoverEnter,
  onHoverLeave,
}: {
  module: SidebarModule;
  pathname: string | null;
  onNavigate: () => void;
  badges: ReturnType<typeof useSidebarBadges>["badges"];
  isLast: boolean;
  isHovered: boolean;
  onHoverEnter: () => void;
  onHoverLeave: () => void;
}) {
  const hasActive = moduleHasActive(module, pathname);
  const iconRef = useRef<HTMLDivElement>(null);

  // Fecha popover apos navegar
  function handleNavigate() {
    onHoverLeave();
    onNavigate();
  }

  // Calcula top do popover baseado na posicao do icone
  const popoverTop = iconRef.current
    ? iconRef.current.getBoundingClientRect().top
    : 0;

  return (
    <div
      className="relative"
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
    >
      {/* Icone do modulo (nivel 1) */}
      <div
        ref={iconRef}
        className="flex justify-center items-center py-2.5 rounded-lg transition-colors cursor-pointer"
        style={{
          color: hasActive ? "var(--brand-primary)" : "var(--text-secondary)",
          background: hasActive ? "var(--brand-glow)" : "transparent",
          filter: hasActive ? "drop-shadow(0 0 4px var(--brand-glow))" : "none",
        }}
        title={module.sectionTitle}
      >
        {module.icon}
      </div>

      {/* Separador entre modulos no modo collapsed */}
      {!isLast && (
        <div
          className="mx-auto my-0.5"
          style={{
            width: 20,
            height: 1,
            background: "var(--border-subtle)",
          }}
        />
      )}

      {/* Popover flutuante com categorias e itens */}
      {isHovered && (
        <div
          className="fixed left-16 z-50 w-64 max-h-[80vh] overflow-y-auto py-3 px-2 shadow-xl"
          style={{
            top: Math.min(popoverTop, window.innerHeight * 0.2),
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-md)",
          }}
          // Impede que o popover feche ao passar o mouse sobre ele
          onMouseEnter={onHoverEnter}
        >
          {/* Titulo do modulo no popover */}
          <div
            className="px-3 py-2 text-sm font-bold mb-1"
            style={{ color: "var(--brand-primary)" }}
          >
            {module.sectionTitle}
          </div>
          <div
            className="h-px mb-2"
            style={{ background: "var(--border-subtle)" }}
          />
          {/* Categorias e itens — todas expandidas no popover */}
          {module.categories.map((cat) => (
            <div key={cat.id} className="mb-2">
              <div
                className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider"
                style={{ color: "var(--text-muted)" }}
              >
                {cat.label}
              </div>
              {cat.items.map((item) => {
                const active = isActive(pathname, item);
                const itemBadge = item.badgeKey
                  ? getBadgeCount(item.badgeKey, badges)
                  : undefined;
                return (
                  <NavItemRow
                    key={item.id}
                    item={item}
                    active={active}
                    collapsed={false}
                    onNavigate={handleNavigate}
                    badgeCount={itemBadge}
                    depth={0}
                  />
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Componente Principal ---

export function UnifiedSidebar() {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState("");
  const [expandedModuleId, setExpandedModuleId] = useState<string | null>(null);
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(
    null,
  );
  const [hoveredModuleId, setHoveredModuleId] = useState<string | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  const { isModuleEnabled, isLoading: flagsLoading } = useModuleFlags();
  const { roles, isLoading: rolesLoading, userInfo } = useUserRoles();
  const { badges } = useSidebarBadges();

  const sidebarWidth = collapsed ? "w-16" : "w-64";
  const isSearching = query.trim().length > 0;

  // Ref para garantir que auto-expand so execute quando pathname muda
  // Nao quando filteredModules muda de referencia (isModuleEnabled muda a cada render)
  const prevPathnameRef = useRef<string | null>(null);

  // Filtra a arvore por RBAC + feature flags + busca textual
  const filteredModules = useMemo(() => {
    if (rolesLoading) return [];

    const q = query.toLowerCase().trim();

    return SIDEBAR_MODULES.map((module) => {
      if (!hasRole(module.roles, roles)) return null;

      const filteredCategories = module.categories
        .map((cat) => {
          if (!hasRole(cat.roles, roles)) return null;

          const filteredItems = cat.items.filter((item) => {
            if (!hasRole(item.roles, roles)) return false;
            if (item.flagKey && !isModuleEnabled(item.flagKey)) return false;
            if (q && !item.label.toLowerCase().includes(q)) return false;
            return true;
          });

          if (filteredItems.length === 0) return null;
          return { ...cat, items: filteredItems };
        })
        .filter((cat): cat is SidebarCategory => cat !== null);

      if (filteredCategories.length === 0) return null;
      return { ...module, categories: filteredCategories };
    }).filter((mod): mod is SidebarModule => mod !== null);
  }, [roles, rolesLoading, isModuleEnabled, query]);

  // Auto-expande o modulo/categoria ativa apenas quando a rota muda
  // O ref previne re-execucao quando filteredModules muda de referencia
  // (isModuleEnabled do hook muda a cada render, causando novo useMemo)
  useEffect(() => {
    if (prevPathnameRef.current === pathname) return;
    prevPathnameRef.current = pathname;

    if (!pathname || rolesLoading || isSearching || collapsed) return;
    for (const mod of filteredModules) {
      if (moduleHasActive(mod, pathname)) {
        setExpandedModuleId(mod.id);
        for (const cat of mod.categories) {
          if (categoryHasActive(cat, pathname)) {
            setExpandedCategoryId(cat.id);
            break;
          }
        }
        break;
      }
    }
  }, [pathname, rolesLoading, collapsed, filteredModules, isSearching]);

  // Single-expand: ao expandir um modulo, fecha os outros
  function handleModuleToggle(moduleId: string) {
    setExpandedModuleId((prev) => (prev === moduleId ? null : moduleId));
    setExpandedCategoryId(null);
  }

  // Single-expand: ao expandir uma categoria, fecha as outras
  function handleCategoryToggle(categoryId: string) {
    setExpandedCategoryId((prev) => (prev === categoryId ? null : categoryId));
  }

  // Hover no modo collapsed — apenas um popover aberto por vez
  function handleHoverEnter(moduleId: string) {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setHoveredModuleId(moduleId);
  }

  function handleHoverLeave() {
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredModuleId(null);
    }, 150);
  }

  // Cleanup do timeout no unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  // Verifica se modulo esta expandido (sem forçar expansao de rotas ativas)
  function isModuleExpanded(module: SidebarModule): boolean {
    if (isSearching) return true;
    return expandedModuleId === module.id;
  }

  function isCategoryExpanded(category: SidebarCategory): boolean {
    if (isSearching) return true;
    return expandedCategoryId === category.id;
  }

  const loading = flagsLoading || rolesLoading;

  return (
    <>
      {/* Botao hamburger — mobile apenas */}
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

      {/* Overlay mobile */}
      {open && (
        <div
          className="fixed inset-0 z-30 md:hidden"
          style={{ background: "rgba(0,0,0,0.6)" }}
          role="button"
          tabIndex={0}
          aria-label="Fechar menu"
          onClick={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
        />
      )}

      <aside
        className={`fixed md:sticky md:top-0 z-40 ${sidebarWidth} flex flex-col shrink-0 transition-all duration-300 h-screen ${open ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
        style={{
          borderRight: "1px solid var(--border-subtle)",
          background: "var(--surface-1)",
        }}
      >
        {/* Header: Brand + toggle */}
        <div
          className={`flex items-center justify-between ${collapsed ? "px-2" : "px-4"} pt-5 pb-3 shrink-0`}
        >
          <div
            className={`flex items-center gap-2.5 ${collapsed ? "md:hidden" : ""}`}
          >
            <div className="relative">
              <div
                className="absolute inset-0 rounded-lg"
                style={{
                  background:
                    "radial-gradient(circle, var(--brand-glow) 0%, transparent 70%)",
                  filter: "blur(4px)",
                }}
              />
              <div className="relative">
                <LogoMark size={26} />
              </div>
            </div>
            <div className="min-w-0">
              <h2
                className="text-sm font-bold tracking-tight"
                style={{ color: "var(--brand-primary)" }}
              >
                JLMIRROR
              </h2>
              <p
                className="text-[10px] truncate tracking-wide"
                style={{ color: "var(--text-muted)" }}
              >
                Portal de Monitoramento
              </p>
            </div>
          </div>

          {/* Logo mini no modo collapsed */}
          <div
            className={`hidden md:flex items-center justify-center ${collapsed ? "" : "md:hidden"}`}
          >
            <LogoMark size={26} />
          </div>

          {/* Botao recolher/expandir */}
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
            {collapsed ? (
              <PanelLeftOpen size={14} />
            ) : (
              <PanelLeftClose size={14} />
            )}
          </button>
        </div>

        {/* Busca global (apenas expandido) */}
        {!collapsed && (
          <div className="px-3 pb-3 shrink-0">
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

        {/* Navegacao: modulos 3-niveis */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 pb-2 sidebar-nav-scroll">
          {loading && (
            <div
              className="px-3 py-8 text-center text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              Carregando módulos...
            </div>
          )}
          {!loading && filteredModules.length === 0 && (
            <div
              className="px-3 py-8 text-center text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              {isSearching
                ? `Nenhum resultado para "${query}"`
                : "Nenhum módulo disponível"}
            </div>
          )}
          {!loading &&
            filteredModules.map((module, idx) =>
              collapsed ? (
                <ModuleSectionCollapsed
                  key={module.id}
                  module={module}
                  pathname={pathname}
                  onNavigate={() => setOpen(false)}
                  badges={badges}
                  isLast={idx === filteredModules.length - 1}
                  isHovered={hoveredModuleId === module.id}
                  onHoverEnter={() => handleHoverEnter(module.id)}
                  onHoverLeave={handleHoverLeave}
                />
              ) : (
                <ModuleSectionExpanded
                  key={module.id}
                  module={module}
                  pathname={pathname}
                  isExpanded={isModuleExpanded(module)}
                  isCategoryExpandedFn={isCategoryExpanded}
                  onModuleToggle={() => handleModuleToggle(module.id)}
                  onCategoryToggle={handleCategoryToggle}
                  onNavigate={() => setOpen(false)}
                  badges={badges}
                  isLast={idx === filteredModules.length - 1}
                />
              ),
            )}
        </nav>

        {/* Rodape: perfil do utilizador + atalhos */}
        <div
          className="shrink-0"
          style={{ borderTop: "1px solid var(--border-subtle)" }}
        >
          {/* Atalhos de perfil — empilhados verticalmente (expandido) */}
          {!collapsed && (
            <div
              className="px-3 pt-2.5 pb-1 space-y-0.5"
              style={{ borderBottom: "1px solid var(--border-subtle)" }}
            >
              {SIDEBAR_FOOTER_ITEMS.filter((item) =>
                hasRole(item.roles, roles),
              ).map((item) => {
                const active = isActive(pathname, item);
                return (
                  <Link
                    key={item.id}
                    href={item.path ?? "#"}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] font-medium transition-colors no-underline"
                    style={{
                      color: active
                        ? "var(--brand-primary)"
                        : "var(--text-secondary)",
                      background: active ? "var(--brand-glow)" : "transparent",
                      textDecoration: "none",
                    }}
                    onMouseEnter={(e) => {
                      if (!active) {
                        e.currentTarget.style.background =
                          "var(--surface-hover)";
                        e.currentTarget.style.color = "var(--text-primary)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!active) {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.color = "var(--text-secondary)";
                      }
                    }}
                    title={item.label}
                  >
                    <span
                      className="shrink-0"
                      style={{
                        opacity: active ? 1 : 0.65,
                        transform: "scale(0.85)",
                      }}
                    >
                      {item.icon}
                    </span>
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          )}

          {/* Atalhos collapsed (icones verticais) */}
          {collapsed && (
            <div
              className="hidden md:flex flex-col items-center gap-0.5 pt-2 pb-1"
              style={{ borderBottom: "1px solid var(--border-subtle)" }}
            >
              {SIDEBAR_FOOTER_ITEMS.filter((item) =>
                hasRole(item.roles, roles),
              ).map((item) => {
                const active = isActive(pathname, item);
                return (
                  <Link
                    key={item.id}
                    href={item.path ?? "#"}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-center rounded-lg p-1.5 transition-colors no-underline"
                    style={{
                      color: active
                        ? "var(--brand-primary)"
                        : "var(--text-secondary)",
                      background: active ? "var(--brand-glow)" : "transparent",
                      textDecoration: "none",
                    }}
                    title={item.label}
                  >
                    {item.icon}
                  </Link>
                );
              })}
            </div>
          )}

          {/* Bloco do perfil + status + logout */}
          <div className="px-3 pt-2.5 pb-3 space-y-2">
            {/* Perfil do utilizador (expandido) */}
            <div
              className={`flex items-center gap-2.5 ${collapsed ? "md:hidden" : ""}`}
            >
              <div
                className="relative flex items-center justify-center rounded-full shrink-0"
                style={{
                  width: 32,
                  height: 32,
                  background: "var(--brand-glow)",
                  border: "1px solid var(--brand-primary)",
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--brand-primary)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
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
                <div
                  className="text-[13px] font-semibold truncate leading-tight"
                  style={{ color: "var(--text-primary)" }}
                >
                  {userInfo?.name ?? "Administrador"}
                </div>
                <div
                  className="text-[10px] truncate leading-tight mt-0.5"
                  style={{ color: "var(--text-muted)" }}
                >
                  {userInfo?.organization ?? "JL Informática"}
                </div>
              </div>
            </div>

            {/* Avatar no modo collapsed */}
            <div
              className={`hidden md:flex items-center justify-center shrink-0 ${collapsed ? "" : "md:hidden"}`}
              style={{
                width: 32,
                height: 32,
                background: "var(--brand-glow)",
                border: "1px solid var(--brand-primary)",
                borderRadius: "50%",
                margin: "0 auto",
              }}
              title={
                userInfo
                  ? `${userInfo.name} — ${userInfo.organization}`
                  : "Administrador"
              }
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--brand-primary)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>

            <ZabbixPingIndicator collapsed={collapsed} />
            <LogoutButton collapsed={collapsed} />
          </div>
        </div>
      </aside>
    </>
  );
}
