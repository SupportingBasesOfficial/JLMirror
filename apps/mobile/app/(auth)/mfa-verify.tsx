// @ai-context: .zero-error/architecture-map.md#ingress
// Tela de MFA TOTP — valida codigo de 6 digitos com mfaVerifySchema.
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
import { useRouter, useLocalSearchParams } from "expo-router";
import { useAuth } from "@/lib/auth-context.js";
import { ApiError } from "@/lib/api-client.js";
import { mfaVerifySchema } from "@repo/shared-validation";

export default function MfaVerifyScreen() {
  const router = useRouter();
  const { verifyMfa } = useAuth();
  const { challengeToken } = useLocalSearchParams<{ challengeToken: string }>();

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleVerify() {
    setError(null);
    setLoading(true);

    try {
      // CORREÇÃO P2: Injeta o token recebido no esquema completo de validação do Zod
      const parsed = mfaVerifySchema.parse({
        code,
        challenge_token: challengeToken || "",
      });

      await verifyMfa(challengeToken || "", parsed.code);
      // AuthProvider atualizou o estado — AuthGate redireciona para /(tabs) automaticamente
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Código inválido");
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
        <View className="mb-8 items-center">
          <Text className="text-2xl font-bold text-foreground">
            Verificação MFA
          </Text>
          <Text className="mt-2 text-sm text-muted-foreground">
            Digite o código de 6 dígitos do seu autenticador
          </Text>
        </View>

        <View className="w-full max-w-sm gap-4">
          <TextInput
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            placeholderTextColor="#525252"
            keyboardType="number-pad"
            maxLength={6}
            className="rounded-lg border border-border bg-card px-4 py-4 text-center text-2xl tracking-[0.5em] text-foreground"
            editable={!loading}
          />

          {error && <Text className="text-sm text-destructive">{error}</Text>}

          <Pressable
            onPress={handleVerify}
            disabled={loading || code.length !== 6}
            className="items-center rounded-lg bg-primary px-4 py-3"
            style={{ opacity: loading || code.length !== 6 ? 0.6 : 1 }}
          >
            {loading ? (
              <ActivityIndicator color="#f0fdfa" />
            ) : (
              <Text className="font-semibold text-primary-foreground">
                Verificar
              </Text>
            )}
          </Pressable>

          <Pressable onPress={() => router.replace("/(auth)/login")}>
            <Text className="text-center text-sm text-muted-foreground">
              Voltar para login
            </Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
