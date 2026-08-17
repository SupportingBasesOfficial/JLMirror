// @ai-context: .zero-error/architecture-map.md#ingress
// Profile — perfil do usuario + alterar senha + logout
import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  Alert,
  ScrollView,
  Modal,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api-client";
import { apiRoutes } from "@/lib/api-routes";
import { ApiError } from "@/lib/api-client";
import { changePasswordSchema } from "@repo/shared-validation";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  manager: "Gerente",
  technician: "Tecnico",
  viewer: "Visualizador",
  user: "Usuario",
};

export default function ProfileScreen() {
  const { user, tenants, logout, refreshUser } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Modal de alterar senha
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await refreshUser();
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    } finally {
      setRefreshing(false);
    }
  }

  function handleLogout() {
    Alert.alert("Sair", "Deseja realmente sair?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Sair", style: "destructive", onPress: () => logout() },
    ]);
  }

  async function handleChangePassword() {
    if (newPassword !== confirmPassword) {
      Alert.alert("Erro", "As senhas nao coincidem");
      return;
    }

    setChangingPassword(true);
    try {
      const parsed = changePasswordSchema.parse({
        current_password: currentPassword,
        new_password: newPassword,
      });
      await api.post(apiRoutes.auth.changePassword, {
        current_password: parsed.current_password,
        new_password: parsed.new_password,
      });
      Alert.alert("Sucesso", "Senha alterada com sucesso");
      setShowPasswordModal(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        Alert.alert("Erro", err.message);
      } else if (err instanceof Error) {
        Alert.alert("Erro", err.message);
      } else {
        Alert.alert("Erro", "Falha ao alterar senha");
      }
    } finally {
      setChangingPassword(false);
    }
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="px-4 pt-4 pb-8"
    >
      {/* Avatar + nome + botao atualizar */}
      <View className="items-center mb-6">
        <View className="w-20 h-20 rounded-full bg-primary items-center justify-center">
          <Text className="text-2xl font-bold text-primary-foreground">
            {user?.full_name?.charAt(0)?.toUpperCase() ?? "?"}
          </Text>
        </View>
        <Text className="mt-3 text-xl font-bold text-foreground">
          {user?.full_name ?? "Usuario"}
        </Text>
        <Text className="text-sm text-muted-foreground">{user?.email}</Text>
        <Pressable
          onPress={handleRefresh}
          disabled={refreshing}
          className="mt-3 flex-row items-center gap-1.5 rounded-lg bg-card border border-border px-3 py-1.5 active:opacity-70"
          style={{ opacity: refreshing ? 0.5 : 1 }}
        >
          {refreshing ? (
            <ActivityIndicator size={12} color="#0d9488" />
          ) : (
            <Ionicons name="refresh-outline" size={14} color="#0d9488" />
          )}
          <Text className="text-xs font-semibold text-primary">Atualizar</Text>
        </Pressable>
      </View>

      {/* Tenants */}
      <View className="rounded-lg bg-card p-4 border border-border mb-4">
        <Text className="text-sm font-semibold text-foreground mb-3">
          Organizacoes
        </Text>
        {tenants.length === 0 ? (
          <Text className="text-xs text-muted-foreground">
            Nenhuma organizacao associada
          </Text>
        ) : (
          <View className="gap-3">
            {tenants.map(
              (t: { tenant_id: string; role: string; scope: string }) => (
                <View
                  key={t.tenant_id}
                  className="flex-row items-center justify-between"
                >
                  <View className="flex-row items-center gap-2 flex-1">
                    <View className="w-8 h-8 rounded-lg bg-secondary items-center justify-center">
                      <Ionicons
                        name="business-outline"
                        size={16}
                        color="#0d9488"
                      />
                    </View>
                    <View className="flex-1">
                      <Text
                        className="text-sm text-foreground"
                        numberOfLines={1}
                      >
                        {t.tenant_id}
                      </Text>
                      <Text className="text-xs text-muted-foreground">
                        {t.scope === "global"
                          ? "Escopo global"
                          : "Escopo tenant"}
                      </Text>
                    </View>
                  </View>
                  <View
                    className="px-2 py-1 rounded"
                    style={{ backgroundColor: "#0d948820" }}
                  >
                    <Text className="text-xs font-semibold text-primary">
                      {ROLE_LABELS[t.role] ?? t.role}
                    </Text>
                  </View>
                </View>
              ),
            )}
          </View>
        )}
      </View>

      {/* Menu items */}
      <View className="rounded-lg bg-card border border-border mb-4">
        <Pressable
          onPress={() => router.push("/profile/edit")}
          className="flex-row items-center justify-between p-4 border-b border-border active:opacity-70"
        >
          <View className="flex-row items-center gap-3">
            <Ionicons name="person-outline" size={20} color="#0d9488" />
            <Text className="text-foreground">Editar perfil</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#525252" />
        </Pressable>
        <Pressable
          onPress={() => router.push("/profile/preferences")}
          className="flex-row items-center justify-between p-4 border-b border-border active:opacity-70"
        >
          <View className="flex-row items-center gap-3">
            <Ionicons name="options-outline" size={20} color="#0d9488" />
            <Text className="text-foreground">Preferencias</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#525252" />
        </Pressable>
        <Pressable
          onPress={() => router.push("/profile/sessions")}
          className="flex-row items-center justify-between p-4 border-b border-border active:opacity-70"
        >
          <View className="flex-row items-center gap-3">
            <Ionicons
              name="shield-checkmark-outline"
              size={20}
              color="#0d9488"
            />
            <Text className="text-foreground">Sessoes & Seguranca</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#525252" />
        </Pressable>
        <Pressable
          onPress={() => setShowPasswordModal(true)}
          className="flex-row items-center justify-between p-4 border-b border-border active:opacity-70"
        >
          <View className="flex-row items-center gap-3">
            <Ionicons name="key-outline" size={20} color="#0d9488" />
            <Text className="text-foreground">Alterar senha</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#525252" />
        </Pressable>
      </View>

      {/* Logout */}
      <Pressable
        onPress={handleLogout}
        className="flex-row items-center justify-center gap-2 rounded-lg bg-destructive px-4 py-3 active:opacity-70"
      >
        <Ionicons name="log-out-outline" size={20} color="#fafafa" />
        <Text className="font-semibold text-destructive-foreground">Sair</Text>
      </Pressable>

      {/* Versao */}
      <Text className="text-center text-xs text-muted-foreground mt-6">
        JLMirror Mobile v0.1.0
      </Text>

      {/* Modal de alterar senha */}
      <Modal visible={showPasswordModal} animationType="slide" transparent>
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-card rounded-t-2xl p-6 gap-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-lg font-bold text-foreground">
                Alterar senha
              </Text>
              <Pressable onPress={() => setShowPasswordModal(false)}>
                <Ionicons name="close" size={24} color="#525252" />
              </Pressable>
            </View>

            <View className="gap-3">
              <View>
                <Text className="mb-1 text-sm text-muted-foreground">
                  Senha atual
                </Text>
                <TextInput
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  secureTextEntry
                  placeholder="••••••••"
                  placeholderTextColor="#525252"
                  className="rounded-lg bg-background border border-border px-4 py-3 text-foreground"
                />
              </View>
              <View>
                <Text className="mb-1 text-sm text-muted-foreground">
                  Nova senha
                </Text>
                <TextInput
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry
                  placeholder="••••••••"
                  placeholderTextColor="#525252"
                  className="rounded-lg bg-background border border-border px-4 py-3 text-foreground"
                />
              </View>
              <View>
                <Text className="mb-1 text-sm text-muted-foreground">
                  Confirmar nova senha
                </Text>
                <TextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  placeholder="••••••••"
                  placeholderTextColor="#525252"
                  className="rounded-lg bg-background border border-border px-4 py-3 text-foreground"
                />
              </View>
            </View>

            <Pressable
              onPress={handleChangePassword}
              disabled={
                changingPassword ||
                !currentPassword ||
                !newPassword ||
                !confirmPassword
              }
              className="items-center rounded-lg bg-primary px-4 py-3"
              style={{
                opacity:
                  changingPassword ||
                  !currentPassword ||
                  !newPassword ||
                  !confirmPassword
                    ? 0.5
                    : 1,
              }}
            >
              {changingPassword ? (
                <ActivityIndicator color="#f0fdfa" />
              ) : (
                <Text className="font-semibold text-primary-foreground">
                  Confirmar
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
