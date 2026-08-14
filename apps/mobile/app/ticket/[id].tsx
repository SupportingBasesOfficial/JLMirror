// @ai-context: .zero-error/architecture-map.md#ingress
// Detalhe do ticket — info completa + lista de comentarios + adicionar comentario
import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useTicket } from "@/hooks/use-ticket";
import { api } from "@/lib/api-client";
import { apiRoutes } from "@/lib/api-routes";
import type { TicketComment } from "@/lib/api-routes";
import { EmptyState } from "@/components/ui/empty-state";
import { useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "#dc2626",
  high: "#f59e0b",
  medium: "#0d9488",
  low: "#525252",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Aberto",
  in_progress: "Em Andamento",
  waiting: "Aguardando",
  resolved: "Resolvido",
  closed: "Fechado",
  cancelled: "Cancelado",
};

export default function TicketDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useTicket(id);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  async function handleAddComment() {
    if (!comment.trim() || !id) return;
    setSending(true);
    try {
      await api.post(apiRoutes.tickets.comments(id), { body: comment.trim() });
      setComment("");
      // Invalida cache para refetch
      queryClient.invalidateQueries({ queryKey: ["tickets", "detail", id] });
      queryClient.invalidateQueries({ queryKey: ["tickets", "list"] });
    } catch (err: unknown) {
      Alert.alert(
        "Erro",
        err instanceof Error ? err.message : "Falha ao enviar comentario",
      );
    } finally {
      setSending(false);
    }
  }

  async function handleChangeStatus(newStatus: string) {
    if (!id) return;
    setUpdatingStatus(true);
    try {
      await api.put(apiRoutes.tickets.update(id), { status: newStatus });
      queryClient.invalidateQueries({ queryKey: ["tickets", "detail", id] });
      queryClient.invalidateQueries({ queryKey: ["tickets", "list"] });
    } catch (err: unknown) {
      Alert.alert(
        "Erro",
        err instanceof Error ? err.message : "Falha ao atualizar status",
      );
    } finally {
      setUpdatingStatus(false);
    }
  }

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color="#0d9488" />
      </View>
    );
  }

  if (isError || !data) {
    return (
      <EmptyState icon="alert-circle-outline" message="Ticket nao encontrado" />
    );
  }

  const { ticket, comments } = data;
  const priorityColor = PRIORITY_COLORS[ticket.priority] ?? "#525252";

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-background"
    >
      <ScrollView contentContainerClassName="px-4 pt-4 pb-8 gap-4">
        {/* Header do ticket */}
        <View className="rounded-lg bg-card p-4 border border-border">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-xs font-mono text-muted-foreground">
              #{ticket.ticket_number}
            </Text>
            {ticket.is_overdue && (
              <View className="flex-row items-center gap-1">
                <Ionicons name="warning-outline" size={12} color="#dc2626" />
                <Text className="text-xs text-destructive">Atrasado</Text>
              </View>
            )}
          </View>
          <Text className="text-lg font-bold text-foreground mb-3">
            {ticket.subject}
          </Text>
          {ticket.description && (
            <Text className="text-sm text-muted-foreground mb-3">
              {ticket.description}
            </Text>
          )}
          <View className="flex-row flex-wrap gap-2">
            <View
              className="px-2 py-1 rounded"
              style={{ backgroundColor: `${priorityColor}20` }}
            >
              <Text
                className="text-xs font-medium"
                style={{ color: priorityColor }}
              >
                {ticket.priority}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                const options = Object.keys(STATUS_LABELS);
                Alert.alert("Alterar status", "Selecione o novo status:", [
                  ...options.map((s) => ({
                    text: STATUS_LABELS[s],
                    onPress: () => handleChangeStatus(s),
                  })),
                  { text: "Cancelar", style: "cancel" },
                ]);
              }}
              disabled={updatingStatus}
              className="px-2 py-1 rounded bg-secondary flex-row items-center gap-1 active:opacity-70"
            >
              <Text className="text-xs text-muted-foreground">
                {STATUS_LABELS[ticket.status] ?? ticket.status}
              </Text>
              <Ionicons name="chevron-down" size={10} color="#737373" />
            </Pressable>
            {ticket.category_name && (
              <View
                className="px-2 py-1 rounded"
                style={{
                  backgroundColor: `${ticket.category_color ?? "#525252"}20`,
                }}
              >
                <Text className="text-xs text-muted-foreground">
                  {ticket.category_name}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Metadata */}
        <View className="rounded-lg bg-card p-4 border border-border gap-2">
          {ticket.requester_name && (
            <MetaRow
              icon="person-outline"
              label="Solicitante"
              value={ticket.requester_name}
            />
          )}
          {ticket.requester_email && (
            <MetaRow
              icon="mail-outline"
              label="Email"
              value={ticket.requester_email}
            />
          )}
          <MetaRow
            icon="calendar-outline"
            label="Criado"
            value={new Date(ticket.created_at).toLocaleString("pt-BR")}
          />
        </View>

        {/* Comentarios */}
        <View>
          <Text className="text-sm font-semibold text-foreground mb-3">
            Comentarios ({comments.length})
          </Text>
          {comments.length === 0 ? (
            <Text className="text-sm text-muted-foreground">
              Nenhum comentario ainda
            </Text>
          ) : (
            <View className="gap-3">
              {comments.map((c: TicketComment) => (
                <View
                  key={c.id}
                  className="rounded-lg bg-card p-3 border border-border"
                >
                  <View className="flex-row items-center justify-between mb-1">
                    <Text className="text-xs font-semibold text-primary">
                      {c.author_name}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      {new Date(c.created_at).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Text>
                  </View>
                  <Text className="text-sm text-foreground">{c.body}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Input de comentario fixo no bottom */}
      <View className="border-t border-border bg-card px-4 py-3 flex-row items-end gap-2">
        <TextInput
          value={comment}
          onChangeText={setComment}
          placeholder="Adicionar comentario..."
          placeholderTextColor="#525252"
          multiline
          className="flex-1 rounded-lg bg-background border border-border px-3 py-2 text-sm text-foreground"
          style={{ maxHeight: 100 }}
          editable={!sending}
        />
        <Pressable
          onPress={handleAddComment}
          disabled={!comment.trim() || sending}
          className="w-10 h-10 rounded-lg bg-primary items-center justify-center"
          style={{ opacity: !comment.trim() || sending ? 0.5 : 1 }}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#f0fdfa" />
          ) : (
            <Ionicons name="send" size={18} color="#f0fdfa" />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function MetaRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View className="flex-row items-center justify-between">
      <View className="flex-row items-center gap-2">
        <Ionicons name={icon} size={16} color="#525252" />
        <Text className="text-sm text-muted-foreground">{label}</Text>
      </View>
      <Text className="text-sm text-foreground font-medium">{value}</Text>
    </View>
  );
}
