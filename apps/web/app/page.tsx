// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import {
  CursorProvider,
  ParticleTrail,
  MagneticButton,
  SpotlightCard,
  TiltCard,
  AnimatedCounter,
  ParallaxLayer,
} from "@/components/cursor-effects";

const FEATURES = [
  {
    icon: <path d="M3 3v18h18M18 17V9M13 17V5M8 17v-3" />,
    title: "Monitoramento em Tempo Real",
    desc: "Acompanhe CPU, memória, rede e disponibilidade dos seus servidores com atualização automática a cada 30 segundos.",
  },
  {
    icon: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
    title: "Alertas Inteligentes",
    desc: "Seja avisado instantaneamente sobre quedas, alta carga ou indisponibilidade. Níveis de severidade organizados por prioridade.",
  },
  {
    icon: (
      <>
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </>
    ),
    title: "Painel por Dispositivo",
    desc: "Visualize detalhes de cada servidor com gráficos interativos, gauges de utilização e histórico de até 7 dias.",
  },
  {
    icon: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
    title: "Dados Isolados e Seguros",
    desc: "Cada cliente possui seu próprio ambiente isolado. Suas informações e dispositivos são visíveis apenas para você.",
  },
  {
    icon: (
      <>
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </>
    ),
    title: "Histórico e Tendências",
    desc: "Consulte dados passados para identificar padrões, prever problemas e tomar decisões baseadas em evidências.",
  },
  {
    icon: (
      <>
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </>
    ),
    title: "Confiabilidade Comprovada",
    desc: "Plataforma construída sobre Zabbix, líder de mercado em monitoramento de infraestrutura. Estabilidade garantida.",
  },
];

const STEPS = [
  {
    num: "01",
    title: "Conecte seus servidores",
    desc: "Instale o agente de monitoramento em cada servidor. A detecção é automática e os dados começam a fluir em minutos.",
  },
  {
    num: "02",
    title: "Configure seus alertas",
    desc: "Defina limites de CPU, memória, disco e rede. Escolha o nível de severidade para cada gatilho conforme a criticidade.",
  },
  {
    num: "03",
    title: "Acompanhe em tempo real",
    desc: "Acesse o dashboard quando quiser. Veja o status de todos os dispositivos, drill-down por servidor e histórico completo.",
  },
];

const STATS = [
  { value: "99.9%", label: "Uptime Garantido" },
  { value: "30", label: "Refresh em Segundos" },
  { value: "6", label: "Janelas Temporais" },
  { value: "24", label: "Horas por Dia" },
];

export default function HomePage() {
  return (
    <CursorProvider>
      <ParticleTrail maxParticles={90} />
      <main
        className="min-h-screen relative overflow-hidden"
        style={{ background: "#0B1015", fontFamily: "'JetBrains Mono','Consolas',monospace" }}
      >
        {/* Background layers com parallax */}
        <ParallaxLayer depth={0.03} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: `linear-gradient(rgba(27,168,152,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(27,168,152,0.04) 1px, transparent 1px)`,
              backgroundSize: "56px 56px",
            }}
          />
        </ParallaxLayer>

        <ParallaxLayer depth={0.06} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <div
            style={{
              position: "absolute",
              width: 1000,
              height: 1000,
              top: -300,
              left: "50%",
              transform: "translateX(-50%)",
              background: "radial-gradient(circle, rgba(27,168,152,0.08) 0%, transparent 55%)",
            }}
          />
        </ParallaxLayer>

        <ParallaxLayer depth={0.04} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <div
            style={{
              position: "absolute",
              width: 700,
              height: 700,
              bottom: -200,
              right: -150,
              background: "radial-gradient(circle, rgba(53,208,196,0.05) 0%, transparent 60%)",
            }}
          />
        </ParallaxLayer>

        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{ background: "linear-gradient(90deg, transparent 0%, #1BA89844 50%, transparent 100%)" }}
        />

        <div className="relative" style={{ zIndex: 10 }}>
          {/* NAV */}
          <nav className="flex items-center justify-between px-6 py-5 sm:px-16 lg:px-24">
            <div className="flex items-center gap-3">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
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
                <span className="text-sm font-bold tracking-wide block" style={{ color: "#C9D4DA" }}>
                  JLMIRROR
                </span>
                <span className="text-[8px] uppercase tracking-widest block" style={{ color: "#6E7F88" }}>
                  by JL Informática
                </span>
              </div>
            </div>
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
          </nav>

          {/* HERO */}
          <section
            className="flex flex-col items-center text-center px-6 pt-20 pb-32 sm:pt-32 sm:pb-40 max-w-5xl mx-auto"
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
                Sistema Operacional
              </span>
            </div>

            <h1
              className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-8 leading-[1.1]"
              style={{
                background: "linear-gradient(135deg, #C9D4DA 0%, #1BA898 50%, #35D0C4 80%, #C9D4DA 100%)",
                backgroundSize: "200% auto",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                animation: "gradientShift 6s ease infinite",
              }}
            >
              Portal de Monitoramento
              <br />
              de Infraestrutura
            </h1>

            <p
              className="text-base sm:text-lg max-w-2xl mb-12 leading-relaxed"
              style={{ color: "#6E7F88" }}
            >
              Plataforma profissional de observabilidade para acompanhar a saúde dos seus
              servidores com alertas em tempo real e painéis detalhados por dispositivo.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 mb-16">
              <MagneticButton
                href="/auth/login"
                strength={0.3}
                className="px-8 py-4 rounded-md text-sm font-bold no-underline"
                style={{
                  background: "linear-gradient(135deg, #1BA898 0%, #35D0C4 100%)",
                  color: "#0B1015",
                  boxShadow: "0 0 24px rgba(27,168,152,0.35)",
                  display: "inline-block",
                }}
              >
                Acessar Portal →
              </MagneticButton>
            </div>

            {/* Mockup do dashboard com tilt */}
            <TiltCard
              maxTilt={4}
              className="w-full max-w-4xl rounded-xl overflow-hidden"
              style={{
                border: "1px solid #1E2530",
                boxShadow: "0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(27,168,152,0.08)",
              }}
            >
              <div
                className="flex items-center gap-2 px-4 py-3"
                style={{ background: "#0D1218", borderBottom: "1px solid #1E2530" }}
              >
                <div className="rounded-full" style={{ width: 10, height: 10, background: "#E5484D55" }} />
                <div className="rounded-full" style={{ width: 10, height: 10, background: "#F5A62355" }} />
                <div className="rounded-full" style={{ width: 10, height: 10, background: "#3DD68C55" }} />
                <span className="text-[9px] ml-3" style={{ color: "#6E7F88" }}>
                  jlmirror.local / dashboard
                </span>
              </div>
              <div className="p-5 space-y-4 relative" style={{ background: "#0B1015" }}>
                {/* Scan line animada */}
                <div
                  className="absolute pointer-events-none"
                  style={{
                    left: 0,
                    right: 0,
                    height: 2,
                    background: "linear-gradient(90deg, transparent, #1BA89888, transparent)",
                    animation: "scanLine 4s linear infinite",
                  }}
                />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { l: "ONLINE", v: "12", c: "#3DD68C" },
                    { l: "OFFLINE", v: "0", c: "#E5484D" },
                    { l: "DISPOSITIVOS", v: "12", c: "#3AA0FF" },
                    { l: "ALERTAS", v: "3", c: "#F5A623" },
                  ].map((card) => (
                    <div
                      key={card.l}
                      className="rounded-lg p-3"
                      style={{ background: "#0D1218", border: "1px solid #1E2530" }}
                    >
                      <div
                        className="text-[8px] font-bold uppercase tracking-wide mb-1.5"
                        style={{ color: "#6E7F88" }}
                      >
                        {card.l}
                      </div>
                      <div className="text-xl font-bold" style={{ color: card.c }}>
                        {card.v}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg p-4" style={{ background: "#0D1218", border: "1px solid #1E2530" }}>
                  <div className="flex items-center justify-between mb-3">
                    <div
                      className="text-[9px] font-bold uppercase tracking-wide"
                      style={{ color: "#6E7F88" }}
                    >
                      GRÁFICO DETALHADO
                    </div>
                    <div className="flex gap-1">
                      {["5min", "1h", "24h"].map((t) => (
                        <div
                          key={t}
                          className="text-[8px] px-2 py-0.5 rounded"
                          style={{
                            background: t === "1h" ? "#1BA898" : "#10171C",
                            color: t === "1h" ? "#fff" : "#6E7F88",
                          }}
                        >
                          {t}
                        </div>
                      ))}
                    </div>
                  </div>
                  <svg viewBox="0 0 400 80" className="w-full" style={{ height: 60 }}>
                    <defs>
                      <linearGradient id="mockGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#1BA898" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#1BA898" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M0,60 L40,45 L80,50 L120,30 L160,35 L200,20 L240,25 L280,15 L320,30 L360,20 L400,25 L400,80 L0,80 Z"
                      fill="url(#mockGrad)"
                    />
                    <path
                      d="M0,60 L40,45 L80,50 L120,30 L160,35 L200,20 L240,25 L280,15 L320,30 L360,20 L400,25"
                      fill="none"
                      stroke="#1BA898"
                      strokeWidth="2"
                    />
                  </svg>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {["srv-prod-01", "srv-prod-02"].map((name, idx) => (
                    <div
                      key={name}
                      className="rounded-lg p-3"
                      style={{ background: "#0D1218", border: "1px solid #1E2530" }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold" style={{ color: "#C9D4DA" }}>
                          {name}
                        </span>
                        <span
                          className="rounded-full"
                          style={{ width: 6, height: 6, background: "#3DD68C", animation: "pulse 2s infinite" }}
                        />
                      </div>
                      <div className="flex gap-4">
                        <div className="flex-1">
                          <div className="text-[8px] mb-1" style={{ color: "#6E7F88" }}>
                            CPU
                          </div>
                          <div className="h-1.5 rounded-full" style={{ background: "#1E2530" }}>
                            <div
                              className="h-1.5 rounded-full"
                              style={{
                                width: idx === 0 ? "34%" : "58%",
                                background: "#1BA898",
                                animation: idx === 1 ? "dataPulse 3s ease infinite" : "none",
                              }}
                            />
                          </div>
                        </div>
                        <div className="flex-1">
                          <div className="text-[8px] mb-1" style={{ color: "#6E7F88" }}>
                            REDE
                          </div>
                          <div className="h-1.5 rounded-full" style={{ background: "#1E2530" }}>
                            <div
                              className="h-1.5 rounded-full"
                              style={{ width: "67%", background: "#35D0C4" }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </TiltCard>
          </section>

          {/* STATS com AnimatedCounter */}
          <section className="px-6 sm:px-16 lg:px-24 max-w-5xl mx-auto pb-32">
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

          {/* FEATURES com SpotlightCard + TiltCard */}
          <section className="px-6 sm:px-16 lg:px-24 max-w-6xl mx-auto pb-32">
            <div className="text-center mb-16">
              <div
                className="inline-block px-3 py-1 rounded-full mb-4"
                style={{ background: "#1BA89810", border: "1px solid #1BA89822" }}
              >
                <span
                  className="text-[10px] font-bold uppercase tracking-widest"
                  style={{ color: "#1BA898" }}
                >
                  Capacidades
                </span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: "#C9D4DA" }}>
                Tudo o que você precisa para
                <br />
                manter sua infraestrutura saudável
              </h2>
              <p className="text-sm max-w-xl mx-auto" style={{ color: "#6E7F88" }}>
                Recursos profissionais pensados para equipes que precisam de visibilidade total e
                resposta rápida a incidentes.
              </p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => (
                <TiltCard key={feature.title} maxTilt={6}>
                  <SpotlightCard
                    spotlightColor="rgba(27, 168, 152, 0.10)"
                    spotlightSize={280}
                    className="rounded-xl p-7 h-full"
                    style={{
                      background: "#0D1218",
                      border: "1px solid #1E2530",
                      transition: "border-color 0.3s",
                    }}
                  >
                    <div
                      className="flex items-center justify-center rounded-lg mb-5"
                      style={{
                        width: 44,
                        height: 44,
                        background: "#1BA89812",
                        border: "1px solid #1BA89822",
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
                        {feature.icon}
                      </svg>
                    </div>
                    <h3 className="text-base font-bold mb-3" style={{ color: "#C9D4DA" }}>
                      {feature.title}
                    </h3>
                    <p className="text-sm leading-relaxed" style={{ color: "#6E7F88" }}>
                      {feature.desc}
                    </p>
                  </SpotlightCard>
                </TiltCard>
              ))}
            </div>
          </section>

          {/* COMO FUNCIONA */}
          <section className="px-6 sm:px-16 lg:px-24 max-w-5xl mx-auto pb-32">
            <div className="text-center mb-16">
              <div
                className="inline-block px-3 py-1 rounded-full mb-4"
                style={{ background: "#35D0C410", border: "1px solid #35D0C422" }}
              >
                <span
                  className="text-[10px] font-bold uppercase tracking-widest"
                  style={{ color: "#35D0C4" }}
                >
                  Como Funciona
                </span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: "#C9D4DA" }}>
                Comece em 3 passos
              </h2>
              <p className="text-sm max-w-xl mx-auto" style={{ color: "#6E7F88" }}>
                Do agente ao dashboard, o processo é direto e sem fricção.
              </p>
            </div>
            <div className="space-y-8">
              {STEPS.map((step) => (
                <SpotlightCard
                  key={step.num}
                  spotlightColor="rgba(53, 208, 196, 0.08)"
                  spotlightSize={350}
                  className="rounded-xl p-6"
                  style={{ background: "#0D121808", border: "1px solid #1E2530" }}
                >
                  <div className="flex gap-6 items-start">
                    <div
                      className="flex items-center justify-center rounded-lg shrink-0"
                      style={{
                        width: 56,
                        height: 56,
                        background: "linear-gradient(135deg, #1BA89815 0%, #35D0C408 100%)",
                        border: "1px solid #1BA89833",
                      }}
                    >
                      <span className="text-lg font-bold" style={{ color: "#1BA898" }}>
                        {step.num}
                      </span>
                    </div>
                    <div className="pt-2">
                      <h3 className="text-lg font-bold mb-2" style={{ color: "#C9D4DA" }}>
                        {step.title}
                      </h3>
                      <p className="text-sm leading-relaxed max-w-xl" style={{ color: "#6E7F88" }}>
                        {step.desc}
                      </p>
                    </div>
                  </div>
                </SpotlightCard>
              ))}
            </div>
          </section>

          {/* CTA FINAL */}
          <section className="px-6 sm:px-16 lg:px-24 max-w-3xl mx-auto pb-32 text-center">
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
                <h2 className="text-2xl sm:text-3xl font-bold mb-4" style={{ color: "#C9D4DA" }}>
                  Pronto para monitorar?
                </h2>
                <p className="text-sm mb-8 max-w-md mx-auto" style={{ color: "#6E7F88" }}>
                  Autentique-se e acesse o dashboard completo com todos os dispositivos, alertas e
                  métricas em tempo real.
                </p>
                <MagneticButton
                  href="/auth/login"
                  strength={0.3}
                  className="inline-block px-8 py-4 rounded-md text-sm font-bold no-underline"
                  style={{
                    background: "linear-gradient(135deg, #1BA898 0%, #35D0C4 100%)",
                    color: "#0B1015",
                    boxShadow: "0 0 24px rgba(27,168,152,0.35)",
                  }}
                >
                  Iniciar Sessão →
                </MagneticButton>
              </div>
            </SpotlightCard>
          </section>

          {/* FOOTER */}
          <footer className="px-6 sm:px-16 lg:px-24 py-10" style={{ borderTop: "1px solid #1E2530" }}>
            <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-3">
                <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
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
                  <span className="text-xs font-bold block" style={{ color: "#C9D4DA" }}>
                    JLMIRROR
                  </span>
                  <span className="text-[9px] block" style={{ color: "#6E7F88" }}>
                    © JL Informática
                  </span>
                </div>
              </div>
              <span className="text-[10px]" style={{ color: "#6E7F88" }}>
                Monitoramento profissional de infraestrutura
              </span>
            </div>
          </footer>
        </div>
      </main>
    </CursorProvider>
  );
}
