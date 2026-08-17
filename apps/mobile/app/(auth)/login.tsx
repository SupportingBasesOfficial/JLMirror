// @ai-context: .zero-error/architecture-map.md#ingress
// Tela de login — valida com loginInputSchema de @repo/shared-validation.
// Se MFA requerido → navega para /(auth)/mfa-verify com challengeToken.
import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api-client";
import { loginInputSchema } from "@repo/shared-validation";

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    setError(null);
    setLoading(true);

    try {
      // Valida com Zod antes de enviar
      const parsed = loginInputSchema.parse({ email, password });
      console.warn("[Login] Tentando login com:", parsed.email);
      const res = await login(parsed.email, parsed.password);
      console.warn("[Login] Resposta:", JSON.stringify(res).substring(0, 200));

      // Se MFA requerido, navega para verificacao
      if (res.mfa_required && res.mfa_challenge_token) {
        router.replace({
          pathname: "/(auth)/mfa-verify",
          params: { challengeToken: res.mfa_challenge_token },
        });
      }
      // Se nao tem MFA, o AuthProvider ja atualizou o estado e o AuthGate
      // vai redirecionar para /(tabs) automaticamente.
    } catch (err: unknown) {
      console.warn("[Login] Erro:", err);
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Erro inesperado");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-background"
    >
      <View className="flex-1 items-center justify-center px-6">
        {/* Logo / Titulo */}
        <View className="mb-10 items-center">
          <Text className="text-3xl font-bold text-primary">JLMIRROR</Text>
          <Text className="mt-2 text-sm text-muted-foreground">
            Portal de Monitoramento
          </Text>
        </View>

        {/* Form */}
        <View className="w-full max-w-sm gap-4">
          <View>
            <Text className="mb-1 text-sm text-muted-foreground">Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="admin@jlmirror.com"
              placeholderTextColor="#525252"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              className="rounded-lg border border-border bg-card px-4 py-3 text-foreground"
              editable={!loading}
            />
          </View>

          <View>
            <Text className="mb-1 text-sm text-muted-foreground">Senha</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor="#525252"
              secureTextEntry
              className="rounded-lg border border-border bg-card px-4 py-3 text-foreground"
              editable={!loading}
            />
          </View>

          {error && <Text className="text-sm text-destructive">{error}</Text>}

          <Pressable
            onPress={handleLogin}
            disabled={loading}
            className="items-center rounded-lg bg-primary px-4 py-3"
            style={{ opacity: loading ? 0.6 : 1 }}
          >
            {loading ? (
              <ActivityIndicator color="#f0fdfa" />
            ) : (
              <Text className="font-semibold text-primary-foreground">
                Entrar
              </Text>
            )}
          </Pressable>

          {/* Link para landing page */}
          <Pressable
            onPress={() => router.push("/(auth)/landing")}
            className="mt-6 items-center"
          >
            <Text className="text-xs text-muted-foreground">
              ← Voltar para a pagina inicial
            </Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
