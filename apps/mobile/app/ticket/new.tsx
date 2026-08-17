// @ai-context: .zero-error/architecture-map.md#ingress
// Criar ticket — formulario com subject, description, priority, categoria, requester
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
import { apiRoutes, type TicketCategory } from "@/lib/api-routes";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { ScreenHeader } from "@/components/ui/screen-header";

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
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [requesterName, setRequesterName] = useState("");
  const [requesterEmail, setRequesterEmail] = useState("");
  const [creating, setCreating] = useState(false);

  // Busca categorias
  const { data: categoriesData } = useQuery<{ categories: TicketCategory[] }>({
    queryKey: ["tickets", "categories"],
    queryFn: () => api.get(apiRoutes.tickets.categories),
  });
  const categories = categoriesData?.categories ?? [];

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
        source: "mobile",
      };
      if (categoryId) payload.category_id = categoryId;
      if (requesterName.trim()) payload.requester_name = requesterName.trim();
      if (requesterEmail.trim())
        payload.requester_email = requesterEmail.trim();

      const result = await api.post<{ id: string }>(
        apiRoutes.tickets.create,
        payload,
      );
      queryClient.invalidateQueries({ queryKey: ["tickets", "list"] });
      queryClient.invalidateQueries({ queryKey: ["tickets", "stats"] });
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
      <ScreenHeader title="Novo Ticket" />
      <ScrollView contentContainerClassName="px-4 pt-4 pb-8 gap-4">
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

        {/* Categoria */}
        {categories.length > 0 && (
          <View className="gap-1.5">
            <Text className="text-sm font-semibold text-foreground">
              Categoria
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-2"
            >
              <Pressable
                onPress={() => setCategoryId(null)}
                className={`px-3 py-2 rounded-lg border ${
                  categoryId === null ? "border-foreground" : "border-border"
                }`}
                style={{
                  backgroundColor: categoryId === null ? "#262626" : undefined,
                }}
              >
                <Text className="text-xs font-medium text-muted-foreground">
                  Nenhuma
                </Text>
              </Pressable>
              {categories.map((cat) => (
                <Pressable
                  key={cat.id}
                  onPress={() => setCategoryId(cat.id)}
                  className={`px-3 py-2 rounded-lg border flex-row items-center gap-1.5 ${
                    categoryId === cat.id
                      ? "border-foreground"
                      : "border-border"
                  }`}
                  style={{
                    backgroundColor:
                      categoryId === cat.id ? `${cat.color}20` : undefined,
                  }}
                >
                  <View
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: cat.color }}
                  />
                  <Text
                    className="text-xs font-medium"
                    style={{
                      color: categoryId === cat.id ? cat.color : "#737373",
                    }}
                  >
                    {cat.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Solicitante */}
        <View className="gap-1.5">
          <Text className="text-sm font-semibold text-foreground">
            Solicitante (opcional)
          </Text>
          <TextInput
            value={requesterName}
            onChangeText={setRequesterName}
            placeholder="Nome do solicitante"
            placeholderTextColor="#525252"
            className="rounded-lg bg-card border border-border px-3 py-3 text-sm text-foreground"
            maxLength={100}
          />
          <TextInput
            value={requesterEmail}
            onChangeText={setRequesterEmail}
            placeholder="email@empresa.com"
            placeholderTextColor="#525252"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            className="rounded-lg bg-card border border-border px-3 py-3 text-sm text-foreground"
            maxLength={100}
          />
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
