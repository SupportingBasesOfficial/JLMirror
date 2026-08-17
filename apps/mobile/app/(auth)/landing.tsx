// Landing page mobile — port da landing page do web (hero, solucoes, stats, sobre, contato)
import { ScrollView, View, Text, Pressable, Linking } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

const SOLUTIONS = [
  {
    id: "jlmirror",
    name: "JLMirror",
    tagline: "Observabilidade de Infraestrutura",
    desc: "Monitoramento profissional multi-tenant com alertas em tempo real, dashboards interativos e metricas detalhadas por dispositivo. Construido sobre Zabbix.",
    cta: "Acessar JLMirror",
    status: "active" as const,
    icon: "pulse-outline" as const,
    features: [
      "Tempo Real",
      "Multi-tenant",
      "Alertas Inteligentes",
      "Paineis por Dispositivo",
    ],
  },
  {
    id: "portal-cliente",
    name: "Portal do Cliente",
    tagline: "Central de Atendimento e Suporte",
    desc: "Sistema de tickets, base de conhecimento, faturas e comunicacao direta entre clientes e equipe tecnica. SLA automatizado e categorizacao inteligente.",
    cta: "Acessar Portal",
    status: "active" as const,
    icon: "headset-outline" as const,
    features: [
      "Tickets & SLA",
      "Base de Conhecimento",
      "Faturamento",
      "Avaliacoes",
    ],
  },
  {
    id: "catalogo",
    name: "Catalogo de Servicos",
    tagline: "Produtos e Solucoes JL",
    desc: "Catalogo digital completo com todos os produtos, licenciamentos e servicos oferecidos pela JL Informatica. Consulta de precos, contratos e disponibilidade.",
    cta: "Em Breve",
    status: "soon" as const,
    icon: "cube-outline" as const,
    features: ["Catalogo Digital", "Consultas", "Contratos", "Disponibilidade"],
  },
  {
    id: "gestao",
    name: "Gestao Empresarial",
    tagline: "ERP & Gestao Integrada",
    desc: "Plataforma de gestao integrada com controle financeiro, estoque, vendas, compras e relatorios. Pensado para PMEs que precisam de visao total do negocio.",
    cta: "Em Breve",
    status: "soon" as const,
    icon: "briefcase-outline" as const,
    features: ["Financeiro", "Estoque", "Vendas", "Relatorios"],
  },
  {
    id: "seguranca",
    name: "Seguranca & Compliance",
    tagline: "Auditoria e LGPD",
    desc: "Ferramentas de auditoria de seguranca, gestao de conformidade LGPD, controle de acesso e monitoramento de vulnerabilidades em tempo real.",
    cta: "Em Breve",
    status: "soon" as const,
    icon: "shield-checkmark-outline" as const,
    features: ["Auditoria", "LGPD", "Vulnerabilidades", "Controle de Acesso"],
  },
  {
    id: "nuvem",
    name: "Nuvem & DevOps",
    tagline: "Infraestrutura Cloud",
    desc: "Provisionamento, orquestracao e monitoramento de infraestrutura em nuvem. Kubernetes, CI/CD, automacao e pipelines de deploy automatizados.",
    cta: "Em Breve",
    status: "soon" as const,
    icon: "cloud-outline" as const,
    features: ["Kubernetes", "CI/CD", "Automacao", "Cloud Native"],
  },
];

const STATS = [
  { value: "99.9%", label: "Uptime Garantido" },
  { value: "24/7", label: "Monitoramento" },
  { value: "500+", label: "Dispositivos Gerenciados" },
  { value: "15+", label: "Anos de Experiencia" },
];

const PARTNERS = [
  "Zabbix",
  "Docker",
  "Kubernetes",
  "PostgreSQL",
  "Next.js",
  "Node.js",
];

const ABOUT_CARDS = [
  {
    title: "Missao",
    desc: "Democratizar o acesso a tecnologia de ponta, entregando ferramentas profissionais com simplicidade e suporte real.",
    icon: "flag-outline" as const,
  },
  {
    title: "Visao",
    desc: "Ser a plataforma de referencia em solucoes corporativas de tecnologia, reconhecida pela qualidade e inovacao.",
    icon: "eye-outline" as const,
  },
  {
    title: "Valores",
    desc: "Transparencia, excelencia tecnica, foco no cliente e melhoria continua em tudo o que fazemos.",
    icon: "heart-outline" as const,
  },
];

const COLORS = {
  bg: "#0B1015",
  card: "#0D1218",
  border: "#1E2530",
  text: "#C9D4DA",
  muted: "#6E7F88",
  teal: "#1BA898",
  cyan: "#35D0C4",
  green: "#3DD68C",
  amber: "#F5A623",
  red: "#E5484D",
  dim: "#4A5868",
};

export default function LandingScreen() {
  const router = useRouter();

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* NAV */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 20,
            paddingTop: 50,
            paddingBottom: 16,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                backgroundColor: `${COLORS.teal}15`,
                borderWidth: 1,
                borderColor: `${COLORS.teal}33`,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="pulse" size={18} color={COLORS.teal} />
            </View>
            <View>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "bold",
                  color: COLORS.text,
                  letterSpacing: 0.5,
                }}
              >
                PORTAL JL
              </Text>
              <Text
                style={{
                  fontSize: 8,
                  color: COLORS.muted,
                  textTransform: "uppercase",
                  letterSpacing: 2,
                }}
              >
                JL Informatica
              </Text>
            </View>
          </View>
          <Pressable
            onPress={() => router.push("/(auth)/login")}
            style={{
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: 8,
              backgroundColor: `${COLORS.teal}15`,
              borderWidth: 1,
              borderColor: `${COLORS.teal}55`,
            }}
          >
            <Text
              style={{ fontSize: 12, fontWeight: "bold", color: COLORS.teal }}
            >
              Entrar →
            </Text>
          </Pressable>
        </View>

        {/* HERO */}
        <View
          style={{
            paddingHorizontal: 24,
            paddingTop: 40,
            paddingBottom: 48,
            alignItems: "center",
          }}
        >
          {/* Badge */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: `${COLORS.teal}10`,
              borderWidth: 1,
              borderColor: `${COLORS.teal}33`,
              marginBottom: 28,
            }}
          >
            <View
              style={{
                width: 7,
                height: 7,
                borderRadius: 999,
                backgroundColor: COLORS.green,
              }}
            />
            <Text
              style={{
                fontSize: 9,
                fontWeight: "bold",
                color: COLORS.green,
                textTransform: "uppercase",
                letterSpacing: 2,
              }}
            >
              Plataforma Corporativa · Tecnologia que Impulsiona
            </Text>
          </View>

          {/* Titulo */}
          <Text
            style={{
              fontSize: 34,
              fontWeight: "bold",
              color: COLORS.text,
              textAlign: "center",
              lineHeight: 42,
              marginBottom: 20,
            }}
          >
            Solucoes de Tecnologia{"\n"}
            <Text style={{ color: COLORS.teal }}>
              para Empresas que Crescem
            </Text>
          </Text>

          {/* Subtitulo */}
          <Text
            style={{
              fontSize: 15,
              color: COLORS.muted,
              textAlign: "center",
              lineHeight: 22,
              marginBottom: 32,
              maxWidth: 320,
            }}
          >
            Da observabilidade de infraestrutura a gestao empresarial integrada.
            A JL Informatica entrega plataformas profissionais com seguranca,
            escalabilidade e suporte especializado para o seu negocio.
          </Text>

          {/* Botoes */}
          <View style={{ flexDirection: "row", gap: 12, marginBottom: 40 }}>
            <Pressable
              onPress={() => router.push("/(auth)/login")}
              style={{
                paddingHorizontal: 28,
                paddingVertical: 14,
                borderRadius: 10,
                backgroundColor: COLORS.teal,
              }}
            >
              <Text
                style={{ fontSize: 14, fontWeight: "bold", color: COLORS.bg }}
              >
                Explorar Solucoes →
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/(auth)/login")}
              style={{
                paddingHorizontal: 28,
                paddingVertical: 14,
                borderRadius: 10,
                backgroundColor: "transparent",
                borderWidth: 1,
                borderColor: `${COLORS.teal}55`,
              }}
            >
              <Text
                style={{ fontSize: 14, fontWeight: "bold", color: COLORS.teal }}
              >
                Acessar Portal
              </Text>
            </Pressable>
          </View>

          {/* Hero visual — grid de solucoes */}
          <View
            style={{
              width: "100%",
              borderRadius: 14,
              overflow: "hidden",
              borderWidth: 1,
              borderColor: COLORS.border,
            }}
          >
            {/* Header do "browser" */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 14,
                paddingVertical: 10,
                backgroundColor: "#0D1218",
                borderBottomWidth: 1,
                borderBottomColor: COLORS.border,
              }}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  backgroundColor: `${COLORS.red}55`,
                }}
              />
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  backgroundColor: `${COLORS.amber}55`,
                }}
              />
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  backgroundColor: `${COLORS.green}55`,
                }}
              />
              <Text
                style={{ fontSize: 8, color: COLORS.muted, marginLeft: 10 }}
              >
                portal.jlinformatica.com.br
              </Text>
            </View>
            {/* Grid de solucoes */}
            <View style={{ padding: 14, backgroundColor: COLORS.bg }}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {SOLUTIONS.map((sol) => (
                  <View
                    key={sol.id}
                    style={{
                      width: "47%",
                      borderRadius: 10,
                      padding: 12,
                      backgroundColor: "#0D1218",
                      borderWidth: 1,
                      borderColor: COLORS.border,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 10,
                      }}
                    >
                      <View
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 7,
                          backgroundColor:
                            sol.status === "active"
                              ? `${COLORS.teal}12`
                              : "#1E2530",
                          borderWidth: 1,
                          borderColor:
                            sol.status === "active"
                              ? `${COLORS.teal}22`
                              : "#2A3340",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Ionicons
                          name={sol.icon}
                          size={14}
                          color={
                            sol.status === "active" ? COLORS.teal : COLORS.dim
                          }
                        />
                      </View>
                      <View
                        style={{
                          paddingHorizontal: 7,
                          paddingVertical: 3,
                          borderRadius: 999,
                          backgroundColor:
                            sol.status === "active"
                              ? `${COLORS.green}15`
                              : `${COLORS.amber}15`,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 7,
                            fontWeight: "bold",
                            color:
                              sol.status === "active"
                                ? COLORS.green
                                : COLORS.amber,
                            textTransform: "uppercase",
                          }}
                        >
                          {sol.status === "active" ? "Ativo" : "Em Breve"}
                        </Text>
                      </View>
                    </View>
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: "bold",
                        color:
                          sol.status === "active" ? COLORS.text : COLORS.dim,
                        marginBottom: 2,
                      }}
                    >
                      {sol.name}
                    </Text>
                    <Text style={{ fontSize: 8, color: COLORS.muted }}>
                      {sol.tagline}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>

        {/* STATS */}
        <View style={{ paddingHorizontal: 20, paddingBottom: 48 }}>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              borderRadius: 14,
              overflow: "hidden",
              borderWidth: 1,
              borderColor: COLORS.border,
            }}
          >
            {STATS.map((stat, i) => (
              <View
                key={stat.label}
                style={{
                  width: "50%",
                  paddingVertical: 28,
                  paddingHorizontal: 16,
                  alignItems: "center",
                  backgroundColor: COLORS.card,
                  borderRightWidth: i % 2 === 0 ? 1 : 0,
                  borderRightColor: COLORS.border,
                  borderBottomWidth: i < 2 ? 1 : 0,
                  borderBottomColor: COLORS.border,
                }}
              >
                <Text
                  style={{
                    fontSize: 28,
                    fontWeight: "bold",
                    color: COLORS.teal,
                    marginBottom: 6,
                  }}
                >
                  {stat.value}
                </Text>
                <Text
                  style={{
                    fontSize: 9,
                    color: COLORS.muted,
                    textTransform: "uppercase",
                    letterSpacing: 1.5,
                    textAlign: "center",
                  }}
                >
                  {stat.label}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* SOLUCOES */}
        <View style={{ paddingHorizontal: 20, paddingBottom: 48 }}>
          {/* Header da secao */}
          <View style={{ alignItems: "center", marginBottom: 28 }}>
            <View
              style={{
                paddingHorizontal: 12,
                paddingVertical: 5,
                borderRadius: 999,
                backgroundColor: `${COLORS.teal}10`,
                borderWidth: 1,
                borderColor: `${COLORS.teal}22`,
                marginBottom: 12,
              }}
            >
              <Text
                style={{
                  fontSize: 9,
                  fontWeight: "bold",
                  color: COLORS.teal,
                  textTransform: "uppercase",
                  letterSpacing: 2,
                }}
              >
                Nossas Solucoes
              </Text>
            </View>
            <Text
              style={{
                fontSize: 24,
                fontWeight: "bold",
                color: COLORS.text,
                textAlign: "center",
                marginBottom: 10,
              }}
            >
              Um portfolio completo{"\n"}para a sua empresa
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: COLORS.muted,
                textAlign: "center",
                maxWidth: 300,
                lineHeight: 20,
              }}
            >
              Plataformas integradas que cobrem desde o monitoramento de
              infraestrutura ate a gestao completa do seu negocio.
            </Text>
          </View>

          {/* Cards de solucoes */}
          <View style={{ gap: 16 }}>
            {SOLUTIONS.map((sol) => (
              <View
                key={sol.id}
                style={{
                  borderRadius: 14,
                  padding: 24,
                  backgroundColor: COLORS.card,
                  borderWidth: 1,
                  borderColor:
                    sol.status === "active" ? COLORS.border : "#1A2230",
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 16,
                  }}
                >
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      backgroundColor:
                        sol.status === "active"
                          ? `${COLORS.teal}12`
                          : "#1E2530",
                      borderWidth: 1,
                      borderColor:
                        sol.status === "active"
                          ? `${COLORS.teal}22`
                          : "#2A3340",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons
                      name={sol.icon}
                      size={22}
                      color={sol.status === "active" ? COLORS.teal : COLORS.dim}
                    />
                  </View>
                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 999,
                      backgroundColor:
                        sol.status === "active"
                          ? `${COLORS.green}15`
                          : `${COLORS.amber}15`,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 8,
                        fontWeight: "bold",
                        color:
                          sol.status === "active" ? COLORS.green : COLORS.amber,
                        textTransform: "uppercase",
                      }}
                    >
                      {sol.status === "active" ? "● Disponivel" : "○ Em Breve"}
                    </Text>
                  </View>
                </View>
                <Text
                  style={{
                    fontSize: 17,
                    fontWeight: "bold",
                    color: sol.status === "active" ? COLORS.text : "#5A6A7A",
                    marginBottom: 4,
                  }}
                >
                  {sol.name}
                </Text>
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: "bold",
                    color: sol.status === "active" ? COLORS.teal : COLORS.dim,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                    marginBottom: 10,
                  }}
                >
                  {sol.tagline}
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: COLORS.muted,
                    lineHeight: 20,
                    marginBottom: 16,
                  }}
                >
                  {sol.desc}
                </Text>
                {/* Features */}
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 6,
                    marginBottom: 16,
                  }}
                >
                  {sol.features.map((f) => (
                    <View
                      key={f}
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 6,
                        backgroundColor:
                          sol.status === "active"
                            ? `${COLORS.teal}08`
                            : "#1A2230",
                        borderWidth: 1,
                        borderColor:
                          sol.status === "active"
                            ? `${COLORS.teal}22`
                            : "#2A3340",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 8,
                          fontWeight: "bold",
                          color:
                            sol.status === "active" ? COLORS.teal : COLORS.dim,
                        }}
                      >
                        {f}
                      </Text>
                    </View>
                  ))}
                </View>
                {/* CTA */}
                {sol.status === "active" ? (
                  <Pressable
                    onPress={() => router.push("/(auth)/login")}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      paddingHorizontal: 18,
                      paddingVertical: 10,
                      borderRadius: 8,
                      backgroundColor: COLORS.teal,
                      alignSelf: "flex-start",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "bold",
                        color: COLORS.bg,
                      }}
                    >
                      {sol.cta} →
                    </Text>
                  </Pressable>
                ) : (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      paddingHorizontal: 18,
                      paddingVertical: 10,
                      borderRadius: 8,
                      backgroundColor: "#1A2230",
                      borderWidth: 1,
                      borderColor: "#2A3340",
                      alignSelf: "flex-start",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "bold",
                        color: COLORS.dim,
                      }}
                    >
                      {sol.cta}
                    </Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        </View>

        {/* SOBRE */}
        <View style={{ paddingHorizontal: 20, paddingBottom: 48 }}>
          <View style={{ alignItems: "center", marginBottom: 28 }}>
            <View
              style={{
                paddingHorizontal: 12,
                paddingVertical: 5,
                borderRadius: 999,
                backgroundColor: `${COLORS.cyan}10`,
                borderWidth: 1,
                borderColor: `${COLORS.cyan}22`,
                marginBottom: 12,
              }}
            >
              <Text
                style={{
                  fontSize: 9,
                  fontWeight: "bold",
                  color: COLORS.cyan,
                  textTransform: "uppercase",
                  letterSpacing: 2,
                }}
              >
                Sobre a JL Informatica
              </Text>
            </View>
            <Text
              style={{
                fontSize: 24,
                fontWeight: "bold",
                color: COLORS.text,
                textAlign: "center",
                marginBottom: 10,
              }}
            >
              Tecnologia com proposito
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: COLORS.muted,
                textAlign: "center",
                maxWidth: 320,
                lineHeight: 20,
              }}
            >
              Ha mais de 15 anos, a JL Informatica desenvolve solucoes de
              tecnologia que ajudam empresas a operar com mais eficiencia,
              seguranca e inteligencia. Especialistas em infraestrutura,
              monitoramento e desenvolvimento de software, entregamos
              plataformas que escalam com o seu negocio.
            </Text>
          </View>

          <View style={{ gap: 16 }}>
            {ABOUT_CARDS.map((item) => (
              <View
                key={item.title}
                style={{
                  borderRadius: 14,
                  padding: 22,
                  backgroundColor: COLORS.card,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                }}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    backgroundColor: `${COLORS.teal}15`,
                    borderWidth: 1,
                    borderColor: `${COLORS.teal}33`,
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 14,
                  }}
                >
                  <Ionicons name={item.icon} size={20} color={COLORS.teal} />
                </View>
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: "bold",
                    color: COLORS.text,
                    marginBottom: 8,
                  }}
                >
                  {item.title}
                </Text>
                <Text
                  style={{ fontSize: 13, color: COLORS.muted, lineHeight: 20 }}
                >
                  {item.desc}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* PARCEIROS */}
        <View
          style={{
            paddingHorizontal: 20,
            paddingBottom: 40,
            alignItems: "center",
          }}
        >
          <Text
            style={{
              fontSize: 9,
              fontWeight: "bold",
              color: COLORS.muted,
              textTransform: "uppercase",
              letterSpacing: 2,
              marginBottom: 20,
            }}
          >
            Tecnologias & Parceiros
          </Text>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: 10,
            }}
          >
            {PARTNERS.map((p) => (
              <View
                key={p}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderRadius: 10,
                  backgroundColor: COLORS.card,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "bold",
                    color: COLORS.muted,
                  }}
                >
                  {p}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* CTA FINAL */}
        <View style={{ paddingHorizontal: 20, paddingBottom: 40 }}>
          <View
            style={{
              borderRadius: 20,
              padding: 36,
              alignItems: "center",
              backgroundColor: COLORS.card,
              borderWidth: 1,
              borderColor: `${COLORS.teal}33`,
            }}
          >
            <Text
              style={{
                fontSize: 22,
                fontWeight: "bold",
                color: COLORS.text,
                textAlign: "center",
                marginBottom: 12,
              }}
            >
              Pronto para transformar sua operacao?
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: COLORS.muted,
                textAlign: "center",
                marginBottom: 24,
                maxWidth: 300,
                lineHeight: 20,
              }}
            >
              Acesse o Portal JL e descubra como nossas solucoes podem
              impulsionar o crescimento da sua empresa.
            </Text>
            <View style={{ gap: 12, width: "100%" }}>
              <Pressable
                onPress={() => router.push("/(auth)/login")}
                style={{
                  paddingVertical: 14,
                  borderRadius: 10,
                  backgroundColor: COLORS.teal,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{ fontSize: 14, fontWeight: "bold", color: COLORS.bg }}
                >
                  Acessar Portal →
                </Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  Linking.openURL("mailto:contato@jlinformatica.com.br")
                }
                style={{
                  paddingVertical: 14,
                  borderRadius: 10,
                  backgroundColor: "transparent",
                  borderWidth: 1,
                  borderColor: `${COLORS.teal}55`,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "bold",
                    color: COLORS.teal,
                  }}
                >
                  Falar com Especialista
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* FOOTER */}
        <View
          style={{
            paddingHorizontal: 20,
            paddingVertical: 28,
            borderTopWidth: 1,
            borderTopColor: COLORS.border,
            alignItems: "center",
            gap: 12,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                backgroundColor: `${COLORS.teal}15`,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="pulse" size={14} color={COLORS.teal} />
            </View>
            <View>
              <Text
                style={{ fontSize: 11, fontWeight: "bold", color: COLORS.text }}
              >
                PORTAL JL
              </Text>
              <Text style={{ fontSize: 8, color: COLORS.muted }}>
                © JL Informatica — Tecnologia que Impulsiona
              </Text>
            </View>
          </View>
          <Text style={{ fontSize: 8, color: COLORS.dim, textAlign: "center" }}>
            JLMirror · Portal do Cliente · Catalogo · Gestao · Seguranca · Nuvem
          </Text>
          <Text style={{ fontSize: 8, color: COLORS.dim }}>
            contato@jlinformatica.com.br
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
