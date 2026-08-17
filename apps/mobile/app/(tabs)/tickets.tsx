// @ai-context: .zero-error/architecture-map.md#ingress
// Tickets — lista com stats de SLA, filtros e busca (igual web)
import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  ScrollView,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useTickets } from "@/hooks/use-tickets";
import { useTicketStats } from "@/hooks/use-ticket-stats";
import { TicketCard } from "@/components/ui/ticket-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/lib/api-client";
import { apiRoutes, type TicketCategory } from "@/lib/api-routes";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Ticket } from "@/lib/api-routes";

const STATUS_FILTERS = [
  { value: undefined, label: "Todos" },
  { value: "open", label: "Abertos" },
  { value: "in_progress", label: "Andamento" },
  { value: "waiting_customer", label: "Aguard. Cliente" },
  { value: "resolved", label: "Resolvidos" },
  { value: "closed", label: "Fechados" },
  { value: "cancelled", label: "Cancelados" },
] as const;

const PRIORITY_FILTERS = [
  { value: undefined, label: "Todas" },
  { value: "urgent", label: "Urgente" },
  { value: "high", label: "Alta" },
  { value: "medium", label: "Media" },
  { value: "low", label: "Baixa" },
] as const;

// Cores pre-definidas para nova categoria
const CATEGORY_COLORS = [
  "#1BA898",
  "#3b82f6",
  "#f59e0b",
  "#dc2626",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#6366f1",
];

function formatMins(mins: string | null): string {
  if (!mins) return "—";
  const n = Number.parseFloat(mins);
  if (Number.isNaN(n)) return "—";
  if (n < 60) return `${n.toFixed(0)}m`;
  if (n < 1440) return `${(n / 60).toFixed(1)}h`;
  return `${(n / 1440).toFixed(1)}d`;
}

export default function TicketsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"tickets" | "categories">("tickets");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | undefined>(
    undefined,
  );
  const [priorityFilter, setPriorityFilter] = useState<string | undefined>(
    undefined,
  );
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);

  const { data, isLoading, isError, refetch, isRefetching } = useTickets({
    status: statusFilter,
    priority: priorityFilter,
    search: search || undefined,
    overdue: overdueOnly || undefined,
  });
  const { data: stats } = useTicketStats();
  const { data: categoriesData } = useQuery<{ categories: TicketCategory[] }>({
    queryKey: ["tickets", "categories"],
    queryFn: () => api.get(apiRoutes.tickets.categories),
  });
  const categories = categoriesData?.categories ?? [];

  function handleTicketPress(ticket: Ticket) {
    router.push(`/ticket/${ticket.id}`);
  }

  const tickets = data?.data ?? [];

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color="#0d9488" />
      </View>
    );
  }

  if (isError) {
    return (
      <EmptyState
        icon="cloud-offline-outline"
        message="Erro ao carregar tickets"
      />
    );
  }

  return (
    <View className="flex-1 bg-background">
      {/* Botao FAB - Criar ticket */}
      <Pressable
        onPress={() => router.push("/ticket/new")}
        className="absolute right-4 bottom-4 w-14 h-14 rounded-full bg-primary items-center justify-center active:opacity-70 z-10"
        style={{
          elevation: 4,
          shadowColor: "#000",
          shadowOpacity: 0.3,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 2 },
        }}
      >
        <Ionicons name="add" size={28} color="#f0fdfa" />
      </Pressable>

      {/* Tabs: Tickets | Categorias */}
      <View className="flex-row px-4 pt-4 gap-2">
        <Pressable
          onPress={() => setTab("tickets")}
          className={`flex-1 py-2 rounded-lg items-center ${tab === "tickets" ? "bg-primary" : "bg-card border border-border"}`}
        >
          <Text
            className={`text-xs font-bold ${tab === "tickets" ? "text-primary-foreground" : "text-muted-foreground"}`}
          >
            Tickets ({data?.total ?? 0})
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setTab("categories")}
          className={`flex-1 py-2 rounded-lg items-center ${tab === "categories" ? "bg-primary" : "bg-card border border-border"}`}
        >
          <Text
            className={`text-xs font-bold ${tab === "categories" ? "text-primary-foreground" : "text-muted-foreground"}`}
          >
            Categorias ({categories.length})
          </Text>
        </Pressable>
      </View>

      {/* Stats (apenas na tab tickets) */}
      {tab === "tickets" && stats && (
        <View className="flex-row gap-2 px-4 pt-4">
          <StatCard
            label="Total"
            value={stats.total}
            sub={`${stats.sla.open_tickets} abertos`}
            color="#0d9488"
          />
          <StatCard
            label="Overdue"
            value={stats.sla.overdue}
            sub="atrasados"
            color="#dc2626"
          />
          <StatCard
            label="Resposta"
            value={formatMins(stats.sla.avg_response_mins)}
            sub="tempo medio"
            color="#3b82f6"
          />
          <StatCard
            label="Avaliacao"
            value={
              stats.sla.avg_rating
                ? `${Number.parseFloat(stats.sla.avg_rating).toFixed(1)}★`
                : "—"
            }
            sub="media"
            color="#f59e0b"
          />
        </View>
      )}

      {/* Tab: Categorias */}
      {tab === "categories" ? (
        <CategoriesTab
          categories={categories}
          onRefresh={() =>
            queryClient.invalidateQueries({
              queryKey: ["tickets", "categories"],
            })
          }
          onCreate={() => setShowCategoryForm(true)}
        />
      ) : (
        <>
          {/* Busca + filtros */}
          <View className="px-4 pt-4 gap-3">
            <View className="flex-row items-center gap-2 rounded-lg bg-card border border-border px-3">
              <Ionicons name="search-outline" size={18} color="#525252" />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Buscar ticket..."
                placeholderTextColor="#525252"
                className="flex-1 py-3 text-sm text-foreground"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {search.length > 0 && (
                <Pressable onPress={() => setSearch("")}>
                  <Ionicons name="close-circle" size={18} color="#525252" />
                </Pressable>
              )}
            </View>

            {/* Filtros de status */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-2"
            >
              {STATUS_FILTERS.map((filter) => (
                <Pressable
                  key={filter.label}
                  onPress={() => setStatusFilter(filter.value)}
                  className={`px-3 py-1.5 rounded-lg border ${
                    statusFilter === filter.value
                      ? "bg-primary border-primary"
                      : "bg-card border-border"
                  }`}
                >
                  <Text
                    className={`text-xs font-medium ${
                      statusFilter === filter.value
                        ? "text-primary-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {filter.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Filtros de prioridade */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-2"
            >
              {PRIORITY_FILTERS.map((filter) => (
                <Pressable
                  key={filter.label}
                  onPress={() => setPriorityFilter(filter.value)}
                  className={`px-3 py-1.5 rounded-lg border ${
                    priorityFilter === filter.value
                      ? "bg-secondary border-foreground"
                      : "bg-card border-border"
                  }`}
                >
                  <Text
                    className={`text-xs font-medium ${
                      priorityFilter === filter.value
                        ? "text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {filter.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Checkbox: Apenas overdue */}
            <Pressable
              onPress={() => setOverdueOnly(!overdueOnly)}
              className="flex-row items-center gap-2 active:opacity-70"
            >
              <Ionicons
                name={overdueOnly ? "checkbox" : "square-outline"}
                size={18}
                color={overdueOnly ? "#dc2626" : "#737373"}
              />
              <Text
                className={`text-xs ${overdueOnly ? "text-destructive font-semibold" : "text-muted-foreground"}`}
              >
                Apenas overdue
              </Text>
            </Pressable>

            <Text className="text-xs text-muted-foreground">
              {data?.total ?? 0} ticket{(data?.total ?? 0) !== 1 ? "s" : ""}
            </Text>
          </View>

          {/* Lista */}
          <FlatList
            data={tickets}
            keyExtractor={(item) => item.id}
            contentContainerClassName="px-4 pt-3 pb-20 gap-3"
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={refetch}
                tintColor="#0d9488"
              />
            }
            ListEmptyComponent={
              <EmptyState
                icon="ticket-outline"
                message="Nenhum ticket encontrado"
              />
            }
            renderItem={({ item }) => (
              <TicketCard ticket={item} onPress={handleTicketPress} />
            )}
          />
        </>
      )}

      {/* Modal: Nova Categoria */}
      <CategoryFormModal
        visible={showCategoryForm}
        onClose={() => setShowCategoryForm(false)}
        onCreated={() => {
          setShowCategoryForm(false);
          queryClient.invalidateQueries({
            queryKey: ["tickets", "categories"],
          });
        }}
      />
    </View>
  );
}

// ============================================================================
// CategoriesTab — lista de categorias com cor, SLA, botao excluir + criar
// ============================================================================
function CategoriesTab({
  categories,
  onRefresh,
  onCreate,
}: {
  categories: TicketCategory[];
  onRefresh: () => void;
  onCreate: () => void;
}) {
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleDelete(id: string, name: string) {
    Alert.alert(
      "Excluir categoria",
      `Tem certeza que deseja excluir "${name}"?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: async () => {
            setDeleting(id);
            try {
              await api.delete(apiRoutes.tickets.categoryDetail(id));
              queryClient.invalidateQueries({
                queryKey: ["tickets", "categories"],
              });
            } catch (err: unknown) {
              Alert.alert(
                "Erro",
                err instanceof Error ? err.message : "Falha ao excluir",
              );
            } finally {
              setDeleting(null);
            }
          },
        },
      ],
    );
  }

  if (categories.length === 0) {
    return (
      <View className="flex-1 px-4 pt-8 items-center gap-4">
        <EmptyState
          icon="folder-open-outline"
          message="Nenhuma categoria cadastrada"
        />
        <Pressable
          onPress={onCreate}
          className="flex-row items-center gap-2 rounded-lg bg-primary px-4 py-2.5 active:opacity-70"
        >
          <Ionicons name="add-circle-outline" size={18} color="#f0fdfa" />
          <Text className="text-sm font-semibold text-primary-foreground">
            Nova Categoria
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="px-4 pt-4 pb-20 gap-3"
      refreshControl={
        <RefreshControl
          refreshing={false}
          onRefresh={onRefresh}
          tintColor="#0d9488"
        />
      }
    >
      {/* Botao Nova Categoria */}
      <Pressable
        onPress={onCreate}
        className="flex-row items-center justify-center gap-2 rounded-lg bg-primary py-3 active:opacity-70"
      >
        <Ionicons name="add-circle-outline" size={18} color="#f0fdfa" />
        <Text className="text-sm font-semibold text-primary-foreground">
          Nova Categoria
        </Text>
      </Pressable>

      {categories.map((cat) => (
        <View
          key={cat.id}
          className="rounded-lg bg-card p-4 border border-border"
          style={{ borderLeftWidth: 3, borderLeftColor: cat.color }}
        >
          <View className="flex-row items-center justify-between mb-2">
            <View className="flex-row items-center gap-2 flex-1">
              <View
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: cat.color }}
              />
              <Text
                className="text-sm font-semibold text-foreground flex-1"
                numberOfLines={1}
              >
                {cat.name}
              </Text>
            </View>
            <Pressable
              onPress={() => handleDelete(cat.id, cat.name)}
              disabled={deleting === cat.id}
              className="active:opacity-70"
            >
              {deleting === cat.id ? (
                <ActivityIndicator size={14} color="#dc2626" />
              ) : (
                <Ionicons name="trash-outline" size={16} color="#dc2626" />
              )}
            </Pressable>
          </View>
          {cat.description && (
            <Text className="text-xs text-muted-foreground mb-2">
              {cat.description}
            </Text>
          )}
          <View className="flex-row gap-4">
            <View className="flex-row items-center gap-1">
              <Ionicons name="timer-outline" size={11} color="#737373" />
              <Text className="text-xs text-muted-foreground">
                Resp: {cat.sla_response_hours}h
              </Text>
            </View>
            <View className="flex-row items-center gap-1">
              <Ionicons
                name="checkmark-done-outline"
                size={11}
                color="#737373"
              />
              <Text className="text-xs text-muted-foreground">
                Resol: {cat.sla_resolution_hours}h
              </Text>
            </View>
            <View className="flex-row items-center gap-1">
              <View
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor: cat.is_active ? "#0d9488" : "#525252",
                }}
              />
              <Text className="text-xs text-muted-foreground">
                {cat.is_active ? "Ativa" : "Inativa"}
              </Text>
            </View>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

// ============================================================================
// CategoryFormModal — formulario para criar nova categoria
// ============================================================================
function CategoryFormModal({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(CATEGORY_COLORS[0]!);
  const [slaResp, setSlaResp] = useState("4");
  const [slaRes, setSlaRes] = useState("48");
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    if (!name.trim()) {
      Alert.alert("Validacao", "Informe o nome da categoria");
      return;
    }
    setCreating(true);
    try {
      await api.post(apiRoutes.tickets.categories, {
        name: name.trim(),
        description: description.trim() || undefined,
        color,
        sla_response_hours: Number.parseInt(slaResp, 10) || 4,
        sla_resolution_hours: Number.parseInt(slaRes, 10) || 48,
        is_active: true,
      });
      setName("");
      setDescription("");
      setColor(CATEGORY_COLORS[0]!);
      setSlaResp("4");
      setSlaRes("48");
      onCreated();
    } catch (err: unknown) {
      Alert.alert(
        "Erro",
        err instanceof Error ? err.message : "Falha ao criar categoria",
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 justify-center items-center bg-black/60 p-4"
      >
        <View className="w-full max-w-md rounded-xl bg-card border border-border p-5 gap-4">
          {/* Header */}
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-bold text-primary">
              Nova Categoria
            </Text>
            <Pressable onPress={onClose} className="active:opacity-70">
              <Ionicons name="close" size={20} color="#737373" />
            </Pressable>
          </View>

          {/* Nome */}
          <View className="gap-1.5">
            <Text className="text-xs font-semibold uppercase text-muted-foreground">
              Nome *
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Ex: Rede"
              placeholderTextColor="#525252"
              className="rounded-lg bg-background border border-border px-3 py-2.5 text-sm text-foreground"
              maxLength={100}
            />
          </View>

          {/* Descricao */}
          <View className="gap-1.5">
            <Text className="text-xs font-semibold uppercase text-muted-foreground">
              Descricao (opcional)
            </Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Breve descricao da categoria"
              placeholderTextColor="#525252"
              className="rounded-lg bg-background border border-border px-3 py-2.5 text-sm text-foreground"
              maxLength={200}
            />
          </View>

          {/* Cor */}
          <View className="gap-1.5">
            <Text className="text-xs font-semibold uppercase text-muted-foreground">
              Cor
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {CATEGORY_COLORS.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setColor(c)}
                  className="w-8 h-8 rounded-full items-center justify-center"
                  style={{
                    backgroundColor: c,
                    borderWidth: color === c ? 2 : 0,
                    borderColor: "#f0fdfa",
                  }}
                >
                  {color === c && (
                    <Ionicons name="checkmark" size={16} color="#f0fdfa" />
                  )}
                </Pressable>
              ))}
            </View>
          </View>

          {/* SLA Resposta + Resolucao */}
          <View className="flex-row gap-3">
            <View className="flex-1 gap-1.5">
              <Text className="text-xs font-semibold uppercase text-muted-foreground">
                SLA Resposta (h)
              </Text>
              <TextInput
                value={slaResp}
                onChangeText={setSlaResp}
                keyboardType="numeric"
                className="rounded-lg bg-background border border-border px-3 py-2.5 text-sm text-foreground"
                maxLength={4}
              />
            </View>
            <View className="flex-1 gap-1.5">
              <Text className="text-xs font-semibold uppercase text-muted-foreground">
                SLA Resolucao (h)
              </Text>
              <TextInput
                value={slaRes}
                onChangeText={setSlaRes}
                keyboardType="numeric"
                className="rounded-lg bg-background border border-border px-3 py-2.5 text-sm text-foreground"
                maxLength={4}
              />
            </View>
          </View>

          {/* Botao criar */}
          <Pressable
            onPress={handleCreate}
            disabled={creating || !name.trim()}
            className="rounded-lg bg-primary py-3 items-center justify-center"
            style={{ opacity: creating || !name.trim() ? 0.5 : 1 }}
          >
            {creating ? (
              <ActivityIndicator size="small" color="#f0fdfa" />
            ) : (
              <Text className="text-sm font-semibold text-primary-foreground">
                Criar Categoria
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ============================================================================
// StatCard — card de stat reutilizavel (total, overdue, etc)
// ============================================================================
function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <View
      className="flex-1 rounded-lg bg-card p-3 border"
      style={{ borderColor: `${color}40` }}
    >
      <Text className="text-xs uppercase mb-1 text-muted-foreground">
        {label}
      </Text>
      <Text className="text-xl font-bold" style={{ color }}>
        {value}
      </Text>
      <Text className="text-xs text-muted-foreground">{sub}</Text>
    </View>
  );
}
