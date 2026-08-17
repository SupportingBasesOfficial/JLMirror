// Card de ticket — mostra numero, subject, prioridade, status, requester, atribuido, SLA e data
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Ticket } from "@/lib/api-routes";

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "#dc2626",
  high: "#f59e0b",
  medium: "#3b82f6",
  low: "#525252",
};

const PRIORITY_LABELS: Record<string, string> = {
  urgent: "Urgente",
  high: "Alta",
  medium: "Media",
  low: "Baixa",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Aberto",
  in_progress: "Em Andamento",
  waiting: "Aguardando",
  waiting_customer: "Aguardando Cliente",
  resolved: "Resolvido",
  closed: "Fechado",
  cancelled: "Cancelado",
};

const STATUS_COLORS: Record<string, string> = {
  open: "#3b82f6",
  in_progress: "#0d9488",
  waiting: "#f59e0b",
  waiting_customer: "#f59e0b",
  resolved: "#0d9488",
  closed: "#525252",
  cancelled: "#525252",
};

// Formata data ISO para dd/MM HH:mm
function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface TicketCardProps {
  ticket: Ticket;
  onPress?: (ticket: Ticket) => void;
}

export function TicketCard({ ticket, onPress }: TicketCardProps) {
  const priorityColor = PRIORITY_COLORS[ticket.priority] ?? "#525252";
  const statusColor = STATUS_COLORS[ticket.status] ?? "#525252";
  const assignedName = ticket.assigned_name ?? ticket.assigned_to;
  const slaDue = ticket.sla_resolution_due;
  const slaColor = ticket.is_overdue ? "#dc2626" : "#f59e0b";

  return (
    <Pressable
      onPress={() => onPress?.(ticket)}
      className="rounded-lg bg-card p-4 border border-border active:opacity-70"
      style={{
        borderLeftWidth: 3,
        borderLeftColor: ticket.is_overdue ? "#dc2626" : priorityColor,
      }}
    >
      {/* Topo: numero + overdue */}
      <View className="flex-row items-center justify-between mb-1.5">
        <Text className="text-xs font-mono text-muted-foreground">
          #{ticket.ticket_number}
        </Text>
        {ticket.is_overdue && (
          <View className="flex-row items-center gap-1">
            <Ionicons name="warning-outline" size={12} color="#dc2626" />
            <Text className="text-xs font-semibold text-destructive">
              Atrasado
            </Text>
          </View>
        )}
      </View>

      {/* Subject */}
      <Text
        className="text-sm font-semibold text-foreground mb-2"
        numberOfLines={2}
      >
        {ticket.subject}
      </Text>

      {/* Requester + Assigned (se houver) */}
      <View className="gap-1.5 mb-2">
        {ticket.requester_name && (
          <View className="flex-row items-center gap-1.5">
            <Ionicons name="person-outline" size={11} color="#737373" />
            <Text className="text-xs text-muted-foreground" numberOfLines={1}>
              {ticket.requester_name}
            </Text>
          </View>
        )}
        {assignedName && (
          <View className="flex-row items-center gap-1.5">
            <Ionicons name="headset-outline" size={11} color="#737373" />
            <Text className="text-xs text-muted-foreground" numberOfLines={1}>
              {assignedName}
            </Text>
          </View>
        )}
      </View>

      {/* Badges: prioridade + status + categoria */}
      <View className="flex-row items-center gap-2 flex-wrap mb-2">
        <View
          className="px-2 py-0.5 rounded"
          style={{ backgroundColor: `${priorityColor}20` }}
        >
          <Text
            className="text-xs font-medium"
            style={{ color: priorityColor }}
          >
            {PRIORITY_LABELS[ticket.priority] ?? ticket.priority}
          </Text>
        </View>
        <View
          className="px-2 py-0.5 rounded"
          style={{ backgroundColor: `${statusColor}20` }}
        >
          <Text className="text-xs font-medium" style={{ color: statusColor }}>
            {STATUS_LABELS[ticket.status] ?? ticket.status}
          </Text>
        </View>
        {ticket.category_name && (
          <View
            className="px-2 py-0.5 rounded"
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

      {/* Rodape: SLA due + criado */}
      <View className="flex-row items-center justify-between gap-2">
        {slaDue ? (
          <View className="flex-row items-center gap-1 flex-1">
            <Ionicons name="timer-outline" size={11} color={slaColor} />
            <Text
              className="text-xs"
              style={{ color: slaColor }}
              numberOfLines={1}
            >
              SLA: {formatTime(slaDue)}
            </Text>
          </View>
        ) : (
          <View className="flex-1" />
        )}
        <View className="flex-row items-center gap-1">
          <Ionicons name="calendar-outline" size={11} color="#737373" />
          <Text className="text-xs text-muted-foreground">
            {formatTime(ticket.created_at)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
