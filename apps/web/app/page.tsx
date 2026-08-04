// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState, useEffect } from "react";
import {
  CursorProvider,
  ParticleTrail,
  MagneticButton,
  SpotlightCard,
  TiltCard,
  AnimatedCounter,
  ParallaxLayer,
} from "@/components/cursor-effects";

/* ============================================================
 * Portal JL — Landing Page Corporativa
 * JL Informática — Soluções de Tecnologia para Empresas
 * ============================================================ */

const SOLUTIONS = [
  {
    id: "jlmirror",
    name: "JLMirror",
    tagline: "Observabilidade de Infraestrutura",
    desc: "Monitoramento profissional multi-tenant com alertas em tempo real, dashboards interativos e métricas detalhadas por dispositivo. Construído sobre Zabbix.",
    href: "/auth/login",
    cta: "Acessar JLMirror",
    status: "active",
    icon: (
      <>
        <path d="M3 3v18h18M18 17V9M13 17V5M8 17v-3" />
      </>
    ),
    features: [
      "Tempo Real",
      "Multi-tenant",
      "Alertas Inteligentes",
      "Painéis por Dispositivo",
    ],
  },
  {
    id: "portal-cliente",
    name: "Portal do Cliente",
    tagline: "Central de Atendimento e Suporte",
    desc: "Sistema de tickets, base de conhecimento, faturas e comunicação direta entre clientes e equipe técnica. SLA automatizado e categorização inteligente.",
    href: "/auth/login",
    cta: "Acessar Portal",
    status: "active",
    icon: (
      <>
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </>
    ),
    features: [
      "Tickets & SLA",
      "Base de Conhecimento",
      "Faturamento",
      "Avaliações",
    ],
  },
  {
    id: "catalogo",
    name: "Catálogo de Serviços",
    tagline: "Produtos e Soluços JL",
    desc: "Catálogo digital completo com todos os produtos, licenciamentos e serviços oferecidos pela JL Informática. Consulta de preços, contratos e disponibilidade.",
    href: "#catalogo",
    cta: "Em Breve",
    status: "soon",
    icon: (
      <>
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </>
    ),
    features: ["Catálogo Digital", "Consultas", "Contratos", "Disponibilidade"],
  },
  {
    id: "gestao",
    name: "Gestão Empresarial",
    tagline: "ERP & Gestão Integrada",
    desc: "Plataforma de gestão integrada com controle financeiro, estoque, vendas, compras e relatórios. Pensado para PMEs que precisam de visão total do negócio.",
    href: "#gestao",
    cta: "Em Breve",
    status: "soon",
    icon: (
      <>
        <path d="M2 20h20" />
        <path d="M4 20V8l8-5 8 5v12" />
        <path d="M9 20v-7h6v7" />
      </>
    ),
    features: ["Financeiro", "Estoque", "Vendas", "Relatórios"],
  },
  {
    id: "seguranca",
    name: "Segurança & Compliance",
    tagline: "Auditoria e LGPD",
    desc: "Ferramentas de auditoria de segurança, gestão de conformidade LGPD, controle de acesso e monitoramento de vulnerabilidades em tempo real.",
    href: "#seguranca",
    cta: "Em Breve",
    status: "soon",
    icon: (
      <>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </>
    ),
    features: ["Auditoria", "LGPD", "Vulnerabilidades", "Controle de Acesso"],
  },
  {
    id: "nuvem",
    name: "Nuvem & DevOps",
    tagline: "Infraestrutura Cloud",
    desc: "Provisionamento, orquestração e monitoramento de infraestrutura em nuvem. Kubernetes, CI/CD, automação e pipelines de deploy automatizados.",
    href: "#nuvem",
    cta: "Em Breve",
    status: "soon",
    icon: (
      <>
        <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
      </>
    ),
    features: ["Kubernetes", "CI/CD", "Automação", "Cloud Native"],
  },
];

const STATS = [
  { value: "99.9%", label: "Uptime Garantido" },
  { value: "24/7", label: "Monitoramento" },
  { value: "500+", label: "Dispositivos Gerenciados" },
  { value: "15+", label: "Anos de Experiência" },
];

const PARTNERS = [
  "Zabbix",
  "Docker",
  "Kubernetes",
  "PostgreSQL",
  "Next.js",
  "Node.js",
];

export default function HomePage() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <CursorProvider>
      <ParticleTrail maxParticles={90} />
      <main
        className="min-h-screen relative overflow-hidden"
        style={{
          background: "#0B1015",
          fontFamily: "'JetBrains Mono','Consolas',monospace",
        }}
      >
        {/* Background layers com parallax */}
        <ParallaxLayer
          depth={0.03}
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: `linear-gradient(rgba(27,168,152,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(27,168,152,0.04) 1px, transparent 1px)`,
              backgroundSize: "56px 56px",
            }}
          />
        </ParallaxLayer>

        <ParallaxLayer
          depth={0.06}
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        >
          <div
            style={{
              position: "absolute",
              width: 1200,
              height: 1200,
              top: -400,
              left: "50%",
              transform: "translateX(-50%)",
              background:
                "radial-gradient(circle, rgba(27,168,152,0.08) 0%, transparent 55%)",
            }}
          />
        </ParallaxLayer>

        <ParallaxLayer
          depth={0.04}
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        >
          <div
            style={{
              position: "absolute",
              width: 800,
              height: 800,
              bottom: -200,
              right: -200,
              background:
                "radial-gradient(circle, rgba(53,208,196,0.05) 0%, transparent 60%)",
            }}
          />
        </ParallaxLayer>

        <ParallaxLayer
          depth={0.05}
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        >
          <div
            style={{
              position: "absolute",
              width: 600,
              height: 600,
              top: "40%",
              left: -200,
              background:
                "radial-gradient(circle, rgba(27,168,152,0.04) 0%, transparent 60%)",
            }}
          />
        </ParallaxLayer>

        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, #1BA89844 50%, transparent 100%)",
          }}
        />

        <div className="relative" style={{ zIndex: 10 }}>
          {/* NAV */}
          <nav
            className="fixed top-0 left-0 right-0 flex items-center justify-between px-6 py-4 sm:px-12 lg:px-20 transition-all duration-300"
            style={{
              zIndex: 100,
              background: scrolled ? "rgba(11,16,21,0.92)" : "transparent",
              borderBottom: scrolled
                ? "1px solid #1E2530"
                : "1px solid transparent",
              backdropFilter: scrolled ? "blur(12px)" : "none",
            }}
          >
            <div className="flex items-center gap-3">
              <svg width="36" height="36" viewBox="0 0 32 32" fill="none">
                <path
                  d="M8 22V10M8 10L14 16M8 10L2 16"
                  stroke="#1BA898"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  transform="translate(4 0)"
                />
                <path
                  d="M20 10V22M20 22L26 16M20 22L14 16"
                  stroke="#35D0C4"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  transform="translate(-2 0)"
                />
                <circle cx="16" cy="16" r="2" fill="#1BA898" />
              </svg>
              <div>
                <span
                  className="text-sm font-bold tracking-wide block"
                  style={{ color: "#C9D4DA" }}
                >
                  PORTAL JL
                </span>
                <span
                  className="text-[8px] uppercase tracking-widest block"
                  style={{ color: "#6E7F88" }}
                >
                  JL Informática
                </span>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a
                href="#solucoes"
                className="text-xs font-bold uppercase tracking-wider no-underline transition-colors"
                style={{ color: "#6E7F88" }}
              >
                Soluções
              </a>
              <a
                href="#sobre"
                className="text-xs font-bold uppercase tracking-wider no-underline transition-colors"
                style={{ color: "#6E7F88" }}
              >
                Sobre
              </a>
              <a
                href="#contato"
                className="text-xs font-bold uppercase tracking-wider no-underline transition-colors"
                style={{ color: "#6E7F88" }}
              >
                Contato
              </a>
              <MagneticButton
                href="/auth/login"
                strength={0.4}
                className="px-5 py-2.5 rounded-md text-xs font-bold no-underline"
                style={{
                  background: "#1BA89815",
                  border: "1px solid #1BA89855",
                  color: "#1BA898",
                  display: "inline-block",
                }}
              >
                Entrar →
              </MagneticButton>
            </div>
            <MagneticButton
              href="/auth/login"
              strength={0.4}
              className="md:hidden px-4 py-2 rounded-md text-xs font-bold no-underline"
              style={{
                background: "#1BA89815",
                border: "1px solid #1BA89855",
                color: "#1BA898",
                display: "inline-block",
              }}
            >
              Entrar →
            </MagneticButton>
          </nav>

          {/* HERO */}
          <section
            className="flex flex-col items-center text-center px-6 pt-32 pb-24 sm:pt-40 sm:pb-32 max-w-6xl mx-auto"
            style={{ animation: "fadeIn 0.6s ease-out" }}
          >
            <div
              className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full mb-10"
              style={{ background: "#1BA89810", border: "1px solid #1BA89833" }}
            >
              <span
                className="rounded-full"
                style={{
                  width: 7,
                  height: 7,
                  background: "#3DD68C",
                  boxShadow: "0 0 8px #3DD68C88",
                  animation: "pulse 2s infinite",
                }}
              />
              <span
                className="text-[10px] font-bold uppercase tracking-widest"
                style={{ color: "#3DD68C" }}
              >
                Plataforma Corporativa · Tecnologia que Impulsiona
              </span>
            </div>

            <h1
              className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-8 leading-[1.1]"
              style={{
                background:
                  "linear-gradient(135deg, #C9D4DA 0%, #1BA898 40%, #35D0C4 60%, #C9D4DA 100%)",
                backgroundSize: "200% auto",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                animation: "gradientShift 6s ease infinite",
              }}
            >
              Soluções de Tecnologia
              <br />
              para Empresas que Crescem
            </h1>

            <p
              className="text-base sm:text-lg max-w-2xl mb-12 leading-relaxed"
              style={{ color: "#6E7F88" }}
            >
              Da observabilidade de infraestrutura à gestão empresarial
              integrada. A JL Informática entrega plataformas profissionais com
              segurança, escalabilidade e suporte especializado para o seu
              negócio.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 mb-16">
              <MagneticButton
                href="#solucoes"
                strength={0.3}
                className="px-8 py-4 rounded-md text-sm font-bold no-underline"
                style={{
                  background:
                    "linear-gradient(135deg, #1BA898 0%, #35D0C4 100%)",
                  color: "#0B1015",
                  boxShadow: "0 0 24px rgba(27,168,152,0.35)",
                  display: "inline-block",
                }}
              >
                Explorar Soluções →
              </MagneticButton>
              <MagneticButton
                href="/auth/login"
                strength={0.3}
                className="px-8 py-4 rounded-md text-sm font-bold no-underline"
                style={{
                  background: "transparent",
                  border: "1px solid #1BA89855",
                  color: "#1BA898",
                  display: "inline-block",
                }}
              >
                Acessar Portal
              </MagneticButton>
            </div>

            {/* Hero visual — grid de soluções */}
            <TiltCard
              maxTilt={3}
              className="w-full max-w-5xl rounded-xl overflow-hidden"
              style={{
                border: "1px solid #1E2530",
                boxShadow:
                  "0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(27,168,152,0.08)",
              }}
            >
              <div
                className="flex items-center gap-2 px-4 py-3"
                style={{
                  background: "#0D1218",
                  borderBottom: "1px solid #1E2530",
                }}
              >
                <div
                  className="rounded-full"
                  style={{ width: 10, height: 10, background: "#E5484D55" }}
                />
                <div
                  className="rounded-full"
                  style={{ width: 10, height: 10, background: "#F5A62355" }}
                />
                <div
                  className="rounded-full"
                  style={{ width: 10, height: 10, background: "#3DD68C55" }}
                />
                <span className="text-[9px] ml-3" style={{ color: "#6E7F88" }}>
                  portal.jlinformatica.com.br
                </span>
              </div>
              <div className="p-6 relative" style={{ background: "#0B1015" }}>
                {/* Scan line animada */}
                <div
                  className="absolute pointer-events-none"
                  style={{
                    left: 0,
                    right: 0,
                    height: 2,
                    background:
                      "linear-gradient(90deg, transparent, #1BA89888, transparent)",
                    animation: "scanLine 4s linear infinite",
                  }}
                />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {SOLUTIONS.map((sol) => (
                    <div
                      key={sol.id}
                      className="rounded-lg p-4 transition-all"
                      style={{
                        background: "#0D1218",
                        border: "1px solid #1E2530",
                      }}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div
                          className="flex items-center justify-center rounded-md"
                          style={{
                            width: 32,
                            height: 32,
                            background:
                              sol.status === "active" ? "#1BA89812" : "#1E2530",
                            border:
                              sol.status === "active"
                                ? "1px solid #1BA89822"
                                : "1px solid #2A3340",
                          }}
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke={
                              sol.status === "active" ? "#1BA898" : "#4A5868"
                            }
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            {sol.icon}
                          </svg>
                        </div>
                        <span
                          className="text-[8px] font-bold uppercase px-2 py-0.5 rounded"
                          style={{
                            background:
                              sol.status === "active"
                                ? "#3DD68C15"
                                : "#F5A62315",
                            color:
                              sol.status === "active" ? "#3DD68C" : "#F5A623",
                          }}
                        >
                          {sol.status === "active" ? "Ativo" : "Em Breve"}
                        </span>
                      </div>
                      <div
                        className="text-[11px] font-bold mb-1"
                        style={{
                          color:
                            sol.status === "active" ? "#C9D4DA" : "#4A5868",
                        }}
                      >
                        {sol.name}
                      </div>
                      <div className="text-[9px]" style={{ color: "#6E7F88" }}>
                        {sol.tagline}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </TiltCard>
          </section>

          {/* STATS */}
          <section className="px-6 sm:px-12 lg:px-20 max-w-5xl mx-auto pb-24">
            <div
              className="grid grid-cols-2 sm:grid-cols-4 gap-px rounded-xl overflow-hidden"
              style={{ background: "#1E2530", border: "1px solid #1E2530" }}
            >
              {STATS.map((stat) => (
                <SpotlightCard
                  key={stat.label}
                  spotlightColor="rgba(27, 168, 152, 0.15)"
                  spotlightSize={250}
                  className="text-center py-8 px-4"
                  style={{ background: "#0D1218" }}
                >
                  <AnimatedCounter
                    value={stat.value}
                    className="text-3xl sm:text-4xl font-bold block mb-2"
                    style={{ color: "#1BA898" }}
                  />
                  <div
                    className="text-[10px] uppercase tracking-widest"
                    style={{ color: "#6E7F88" }}
                  >
                    {stat.label}
                  </div>
                </SpotlightCard>
              ))}
            </div>
          </section>

          {/* SOLUÇÕES */}
          <section
            id="solucoes"
            className="px-6 sm:px-12 lg:px-20 max-w-6xl mx-auto pb-24"
          >
            <div className="text-center mb-16">
              <div
                className="inline-block px-3 py-1 rounded-full mb-4"
                style={{
                  background: "#1BA89810",
                  border: "1px solid #1BA89822",
                }}
              >
                <span
                  className="text-[10px] font-bold uppercase tracking-widest"
                  style={{ color: "#1BA898" }}
                >
                  Nossas Soluções
                </span>
              </div>
              <h2
                className="text-3xl sm:text-4xl font-bold mb-4"
                style={{ color: "#C9D4DA" }}
              >
                Um portfólio completo
                <br />
                para a sua empresa
              </h2>
              <p
                className="text-sm max-w-xl mx-auto"
                style={{ color: "#6E7F88" }}
              >
                Plataformas integradas que cobrem desde o monitoramento de
                infraestrutura até a gestão completa do seu negócio.
              </p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {SOLUTIONS.map((sol) => (
                <TiltCard key={sol.id} maxTilt={5}>
                  <SpotlightCard
                    spotlightColor={
                      sol.status === "active"
                        ? "rgba(27, 168, 152, 0.10)"
                        : "rgba(74, 88, 104, 0.06)"
                    }
                    spotlightSize={280}
                    className="rounded-xl p-7 h-full flex flex-col"
                    style={{
                      background: "#0D1218",
                      border:
                        sol.status === "active"
                          ? "1px solid #1E2530"
                          : "1px solid #1A2230",
                      transition: "border-color 0.3s",
                    }}
                  >
                    <div className="flex items-center justify-between mb-5">
                      <div
                        className="flex items-center justify-center rounded-lg"
                        style={{
                          width: 48,
                          height: 48,
                          background:
                            sol.status === "active" ? "#1BA89812" : "#1E2530",
                          border:
                            sol.status === "active"
                              ? "1px solid #1BA89822"
                              : "1px solid #2A3340",
                        }}
                      >
                        <svg
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke={
                            sol.status === "active" ? "#1BA898" : "#4A5868"
                          }
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          {sol.icon}
                        </svg>
                      </div>
                      <span
                        className="text-[9px] font-bold uppercase px-2.5 py-1 rounded-full"
                        style={{
                          background:
                            sol.status === "active" ? "#3DD68C15" : "#F5A62315",
                          color:
                            sol.status === "active" ? "#3DD68C" : "#F5A623",
                        }}
                      >
                        {sol.status === "active"
                          ? "● Disponível"
                          : "○ Em Breve"}
                      </span>
                    </div>
                    <h3
                      className="text-lg font-bold mb-1"
                      style={{
                        color: sol.status === "active" ? "#C9D4DA" : "#5A6A7A",
                      }}
                    >
                      {sol.name}
                    </h3>
                    <p
                      className="text-[11px] font-bold uppercase tracking-wide mb-3"
                      style={{
                        color: sol.status === "active" ? "#1BA898" : "#4A5868",
                      }}
                    >
                      {sol.tagline}
                    </p>
                    <p
                      className="text-sm leading-relaxed mb-5 flex-1"
                      style={{ color: "#6E7F88" }}
                    >
                      {sol.desc}
                    </p>
                    <div className="flex flex-wrap gap-2 mb-5">
                      {sol.features.map((f) => (
                        <span
                          key={f}
                          className="text-[9px] px-2 py-1 rounded font-bold"
                          style={{
                            background:
                              sol.status === "active" ? "#1BA89808" : "#1A2230",
                            color:
                              sol.status === "active" ? "#1BA898" : "#4A5868",
                            border:
                              sol.status === "active"
                                ? "1px solid #1BA89822"
                                : "1px solid #2A3340",
                          }}
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                    {sol.status === "active" ? (
                      <MagneticButton
                        href={sol.href}
                        strength={0.3}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md text-xs font-bold no-underline"
                        style={{
                          background:
                            "linear-gradient(135deg, #1BA898 0%, #35D0C4 100%)",
                          color: "#0B1015",
                          display: "inline-flex",
                        }}
                      >
                        {sol.cta} →
                      </MagneticButton>
                    ) : (
                      <span
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md text-xs font-bold cursor-not-allowed"
                        style={{
                          background: "#1A2230",
                          color: "#4A5868",
                          border: "1px solid #2A3340",
                        }}
                      >
                        {sol.cta}
                      </span>
                    )}
                  </SpotlightCard>
                </TiltCard>
              ))}
            </div>
          </section>

          {/* SOBRE */}
          <section
            id="sobre"
            className="px-6 sm:px-12 lg:px-20 max-w-5xl mx-auto pb-24"
          >
            <div className="text-center mb-16">
              <div
                className="inline-block px-3 py-1 rounded-full mb-4"
                style={{
                  background: "#35D0C410",
                  border: "1px solid #35D0C422",
                }}
              >
                <span
                  className="text-[10px] font-bold uppercase tracking-widest"
                  style={{ color: "#35D0C4" }}
                >
                  Sobre a JL Informática
                </span>
              </div>
              <h2
                className="text-3xl sm:text-4xl font-bold mb-4"
                style={{ color: "#C9D4DA" }}
              >
                Tecnologia com propósito
              </h2>
              <p
                className="text-sm max-w-2xl mx-auto leading-relaxed"
                style={{ color: "#6E7F88" }}
              >
                Há mais de 15 anos, a JL Informática desenvolve soluções de
                tecnologia que ajudam empresas a operar com mais eficiência,
                segurança e inteligência. Especialistas em infraestrutura,
                monitoramento e desenvolvimento de software, entregamos
                plataformas que escalam com o seu negócio.
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-3">
              {[
                {
                  title: "Missão",
                  desc: "Democratizar o acesso a tecnologia de ponta, entregando ferramentas profissionais com simplicidade e suporte real.",
                  icon: (
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                  ),
                },
                {
                  title: "Visão",
                  desc: "Ser a plataforma de referência em soluções corporativas de tecnologia, reconhecida pela qualidade e inovação.",
                  icon: (
                    <>
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </>
                  ),
                },
                {
                  title: "Valores",
                  desc: "Transparência, excelência técnica, foco no cliente e melhoria contínua em tudo o que fazemos.",
                  icon: (
                    <>
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      <path d="M9 12l2 2 4-4" />
                    </>
                  ),
                },
              ].map((item) => (
                <SpotlightCard
                  key={item.title}
                  spotlightColor="rgba(53, 208, 196, 0.08)"
                  spotlightSize={300}
                  className="rounded-xl p-7"
                  style={{ background: "#0D1218", border: "1px solid #1E2530" }}
                >
                  <div
                    className="flex items-center justify-center rounded-lg mb-5"
                    style={{
                      width: 44,
                      height: 44,
                      background:
                        "linear-gradient(135deg, #1BA89815 0%, #35D0C408 100%)",
                      border: "1px solid #1BA89833",
                    }}
                  >
                    <svg
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#1BA898"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      {item.icon}
                    </svg>
                  </div>
                  <h3
                    className="text-base font-bold mb-3"
                    style={{ color: "#C9D4DA" }}
                  >
                    {item.title}
                  </h3>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: "#6E7F88" }}
                  >
                    {item.desc}
                  </p>
                </SpotlightCard>
              ))}
            </div>
          </section>

          {/* PARCEIROS / TECNOLOGIAS */}
          <section className="px-6 sm:px-12 lg:px-20 max-w-5xl mx-auto pb-24">
            <div className="text-center mb-12">
              <span
                className="text-[10px] font-bold uppercase tracking-widest"
                style={{ color: "#6E7F88" }}
              >
                Tecnologias & Parceiros
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4">
              {PARTNERS.map((p) => (
                <div
                  key={p}
                  className="px-5 py-3 rounded-lg"
                  style={{
                    background: "#0D1218",
                    border: "1px solid #1E2530",
                  }}
                >
                  <span
                    className="text-xs font-bold"
                    style={{ color: "#6E7F88" }}
                  >
                    {p}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* CTA FINAL */}
          <section
            id="contato"
            className="px-6 sm:px-12 lg:px-20 max-w-3xl mx-auto pb-24 text-center"
          >
            <SpotlightCard
              spotlightColor="rgba(27, 168, 152, 0.12)"
              spotlightSize={400}
              className="rounded-2xl p-12"
              style={{
                background: "linear-gradient(135deg, #0D1218 0%, #10171C 100%)",
                border: "1px solid #1BA89833",
              }}
            >
              <div className="relative">
                <h2
                  className="text-2xl sm:text-3xl font-bold mb-4"
                  style={{ color: "#C9D4DA" }}
                >
                  Pronto para transformar sua operação?
                </h2>
                <p
                  className="text-sm mb-8 max-w-md mx-auto"
                  style={{ color: "#6E7F88" }}
                >
                  Acesse o Portal JL e descubra como nossas soluções podem
                  impulsionar o crescimento da sua empresa.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <MagneticButton
                    href="/auth/login"
                    strength={0.3}
                    className="inline-block px-8 py-4 rounded-md text-sm font-bold no-underline"
                    style={{
                      background:
                        "linear-gradient(135deg, #1BA898 0%, #35D0C4 100%)",
                      color: "#0B1015",
                      boxShadow: "0 0 24px rgba(27,168,152,0.35)",
                    }}
                  >
                    Acessar Portal →
                  </MagneticButton>
                  <MagneticButton
                    href="mailto:contato@jlinformatica.com.br"
                    strength={0.3}
                    className="inline-block px-8 py-4 rounded-md text-sm font-bold no-underline"
                    style={{
                      background: "transparent",
                      border: "1px solid #1BA89855",
                      color: "#1BA898",
                    }}
                  >
                    Falar com Especialista
                  </MagneticButton>
                </div>
              </div>
            </SpotlightCard>
          </section>

          {/* FOOTER */}
          <footer
            className="px-6 sm:px-12 lg:px-20 py-10"
            style={{ borderTop: "1px solid #1E2530" }}
          >
            <div className="max-w-5xl mx-auto">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-6 mb-8">
                <div className="flex items-center gap-3">
                  <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
                    <path
                      d="M8 22V10M8 10L14 16M8 10L2 16"
                      stroke="#1BA898"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      transform="translate(4 0)"
                    />
                    <path
                      d="M20 10V22M20 22L26 16M20 22L14 16"
                      stroke="#35D0C4"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      transform="translate(-2 0)"
                    />
                    <circle cx="16" cy="16" r="2" fill="#1BA898" />
                  </svg>
                  <div>
                    <span
                      className="text-xs font-bold block"
                      style={{ color: "#C9D4DA" }}
                    >
                      PORTAL JL
                    </span>
                    <span
                      className="text-[9px] block"
                      style={{ color: "#6E7F88" }}
                    >
                      © JL Informática — Tecnologia que Impulsiona
                    </span>
                  </div>
                </div>
                <div className="flex gap-6">
                  <a
                    href="#solucoes"
                    className="text-[10px] font-bold uppercase tracking-wider no-underline"
                    style={{ color: "#6E7F88" }}
                  >
                    Soluções
                  </a>
                  <a
                    href="#sobre"
                    className="text-[10px] font-bold uppercase tracking-wider no-underline"
                    style={{ color: "#6E7F88" }}
                  >
                    Sobre
                  </a>
                  <a
                    href="#contato"
                    className="text-[10px] font-bold uppercase tracking-wider no-underline"
                    style={{ color: "#6E7F88" }}
                  >
                    Contato
                  </a>
                </div>
              </div>
              <div
                className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6"
                style={{ borderTop: "1px solid #1E2530" }}
              >
                <span className="text-[10px]" style={{ color: "#4A5868" }}>
                  JLMirror · Portal do Cliente · Catálogo · Gestão · Segurança ·
                  Nuvem
                </span>
                <span className="text-[10px]" style={{ color: "#4A5868" }}>
                  contato@jlinformatica.com.br
                </span>
              </div>
            </div>
          </footer>
        </div>
      </main>
    </CursorProvider>
  );
}
