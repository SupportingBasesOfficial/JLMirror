// @ai-context: .zero-error/architecture-map.md#ingress
// Tickets — lista paginada com filtros de status e prioridade + busca
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
} from "react-native";
import { useRouter } from "expo-router";
import { useTickets } from "@/hooks/use-tickets";
import { TicketCard } from "@/components/ui/ticket-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Ionicons } from "@expo/vector-icons";
import type { Ticket } from "@/lib/api-routes";

const STATUS_FILTERS = [
  { value: undefined, label: "Todos" },
  { value: "open", label: "Abertos" },
  { value: "in_progress", label: "Andamento" },
  { value: "resolved", label: "Resolvidos" },
] as const;

const PRIORITY_FILTERS = [
  { value: undefined, label: "Todas" },
  { value: "urgent", label: "Urgente" },
  { value: "high", label: "Alta" },
  { value: "medium", label: "Media" },
  { value: "low", label: "Baixa" },
] as const;

export default function TicketsScreen() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | undefined>(
    undefined,
  );
  const [priorityFilter, setPriorityFilter] = useState<string | undefined>(
    undefined,
  );

  const { data, isLoading, isError, refetch, isRefetching } = useTickets({
    status: statusFilter,
    priority: priorityFilter,
    search: search || undefined,
  });

  function handleTicketPress(ticket: Ticket) {
    router.push(`/ticket/${ticket.id}`);
  }

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

  const tickets = data?.data ?? [];

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

      {/* Busca */}
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

        <Text className="text-xs text-muted-foreground">
          {data?.total ?? 0} ticket{(data?.total ?? 0) !== 1 ? "s" : ""}
        </Text>
      </View>

      {/* Lista */}
      <FlatList
        data={tickets}
        keyExtractor={(item) => item.id}
        contentContainerClassName="px-4 pt-3 pb-8 gap-3"
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
    </View>
  );
}
