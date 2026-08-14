// @ai-context: .zero-error/architecture-map.md#ingress
// Criar ticket — formulario simples com subject, description, priority
import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { api } from "@/lib/api-client";
import { apiRoutes } from "@/lib/api-routes";
import { useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";

const PRIORITIES = [
  { value: "low", label: "Baixa", color: "#525252" },
  { value: "medium", label: "Media", color: "#0d9488" },
  { value: "high", label: "Alta", color: "#f59e0b" },
  { value: "urgent", label: "Urgente", color: "#dc2626" },
] as const;

export default function NewTicketScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<string>("medium");
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    if (!subject.trim()) {
      Alert.alert("Validacao", "Informe o assunto do ticket");
      return;
    }
    setCreating(true);
    try {
      const payload: Record<string, unknown> = {
        subject: subject.trim(),
        description: description.trim() || null,
        priority,
      };
      const result = await api.post<{ id: string }>(
        apiRoutes.tickets.create,
        payload,
      );
      queryClient.invalidateQueries({ queryKey: ["tickets", "list"] });
      // Navega para o detalhe do ticket recem-criado
      if (result?.id) {
        router.replace(`/ticket/${result.id}`);
      } else {
        router.back();
      }
    } catch (err: unknown) {
      Alert.alert(
        "Erro",
        err instanceof Error ? err.message : "Falha ao criar ticket",
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-background"
    >
      <ScrollView contentContainerClassName="px-4 pt-4 pb-8 gap-4">
        {/* Header */}
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            className="active:opacity-70"
          >
            <Ionicons name="arrow-back" size={24} color="#0d9488" />
          </Pressable>
          <Text className="text-xl font-bold text-foreground">Novo Ticket</Text>
        </View>

        {/* Assunto */}
        <View className="gap-1.5">
          <Text className="text-sm font-semibold text-foreground">
            Assunto *
          </Text>
          <TextInput
            value={subject}
            onChangeText={setSubject}
            placeholder="Resumo do problema"
            placeholderTextColor="#525252"
            className="rounded-lg bg-card border border-border px-3 py-3 text-sm text-foreground"
            maxLength={200}
          />
        </View>

        {/* Descricao */}
        <View className="gap-1.5">
          <Text className="text-sm font-semibold text-foreground">
            Descricao
          </Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Detalhes do problema, passos para reproduzir, etc."
            placeholderTextColor="#525252"
            multiline
            className="rounded-lg bg-card border border-border px-3 py-3 text-sm text-foreground"
            style={{ minHeight: 120, textAlignVertical: "top" }}
            maxLength={2000}
          />
        </View>

        {/* Prioridade */}
        <View className="gap-1.5">
          <Text className="text-sm font-semibold text-foreground">
            Prioridade
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {PRIORITIES.map((p) => (
              <Pressable
                key={p.value}
                onPress={() => setPriority(p.value)}
                className={`px-3 py-2 rounded-lg border ${
                  priority === p.value ? "border-foreground" : "border-border"
                }`}
                style={{
                  backgroundColor:
                    priority === p.value ? `${p.color}20` : undefined,
                }}
              >
                <Text
                  className="text-xs font-medium"
                  style={{ color: priority === p.value ? p.color : "#737373" }}
                >
                  {p.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Botao criar */}
        <Pressable
          onPress={handleCreate}
          disabled={creating || !subject.trim()}
          className="rounded-lg bg-primary py-3.5 items-center justify-center"
          style={{ opacity: creating || !subject.trim() ? 0.5 : 1 }}
        >
          {creating ? (
            <ActivityIndicator size="small" color="#f0fdfa" />
          ) : (
            <View className="flex-row items-center gap-2">
              <Ionicons name="add-circle-outline" size={18} color="#f0fdfa" />
              <Text className="text-sm font-semibold text-primary-foreground">
                Criar Ticket
              </Text>
            </View>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
