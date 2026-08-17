// Preferencias — notificacoes + aparencia (paridade com web profile/preferences tab)
import { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  Switch,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { api } from "@/lib/api-client";
import { apiRoutes, type ProfileResponse } from "@/lib/api-routes";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ScreenHeader } from "@/components/ui/screen-header";

const DIGEST_FREQS = ["instant", "hourly", "daily", "weekly", "never"] as const;
const THEMES = ["dark", "light", "auto"] as const;
const DENSITIES = ["compact", "comfortable", "spacious"] as const;

const DIGEST_LABELS: Record<string, string> = {
  instant: "Instantaneo",
  hourly: "A cada hora",
  daily: "Diario",
  weekly: "Semanal",
  never: "Nunca",
};

const THEME_LABELS: Record<string, string> = {
  dark: "Escuro",
  light: "Claro",
  auto: "Automatico",
};

const DENSITY_LABELS: Record<string, string> = {
  compact: "Compacto",
  comfortable: "Confortavel",
  spacious: "Espacoso",
};

export default function PreferencesScreen() {
  const queryClient = useQueryClient();
  const { data: profileData, isLoading } = useQuery<ProfileResponse>({
    queryKey: ["profile"],
    queryFn: () => api.get(apiRoutes.profile.get),
  });
  const profile = profileData?.profile;

  // Estados de notificacao
  const [notifEmail, setNotifEmail] = useState(true);
  const [notifPush, setNotifPush] = useState(true);
  const [notifSms, setNotifSms] = useState(false);
  const [digestFreq, setDigestFreq] = useState<string>("daily");
  const [quietStart, setQuietStart] = useState("");
  const [quietEnd, setQuietEnd] = useState("");

  // Estados de aparencia
  const [theme, setTheme] = useState<string>("dark");
  const [density, setDensity] = useState<string>("comfortable");

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setNotifEmail(profile.notification_email ?? true);
      setNotifPush(profile.notification_push ?? true);
      setNotifSms(profile.notification_sms ?? false);
      setDigestFreq(profile.notification_digest_frequency ?? "daily");
      setQuietStart(profile.quiet_hours_start ?? "");
      setQuietEnd(profile.quiet_hours_end ?? "");
      setTheme(profile.theme ?? "dark");
      setDensity(profile.density ?? "comfortable");
    }
  }, [profile]);

  async function handleSavePreferences() {
    setSaving(true);
    try {
      await api.put(apiRoutes.profile.preferences, {
        notification_email: notifEmail,
        notification_push: notifPush,
        notification_sms: notifSms,
        notification_digest_frequency:
          digestFreq === "never" ? undefined : digestFreq,
        quiet_hours_start: quietStart || undefined,
        quiet_hours_end: quietEnd || undefined,
        theme,
        density,
      });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      Alert.alert("Sucesso", "Preferencias atualizadas!");
    } catch (err: unknown) {
      Alert.alert(
        "Erro",
        err instanceof Error ? err.message : "Falha ao salvar preferencias",
      );
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader title="Preferencias" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#0d9488" />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-background"
    >
      <ScreenHeader title="Preferencias" />
      <ScrollView contentContainerClassName="px-4 pt-4 pb-8 gap-4">
        {/* Notificacoes */}
        <View className="rounded-lg bg-card p-4 border border-border gap-3">
          <Text className="text-sm font-semibold text-foreground">
            Notificacoes
          </Text>

          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-foreground">Email</Text>
            <Switch
              value={notifEmail}
              onValueChange={setNotifEmail}
              trackColor={{ false: "#525252", true: "#0d9488" }}
              thumbColor="#f0fdfa"
            />
          </View>

          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-foreground">Push</Text>
            <Switch
              value={notifPush}
              onValueChange={setNotifPush}
              trackColor={{ false: "#525252", true: "#0d9488" }}
              thumbColor="#f0fdfa"
            />
          </View>

          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-foreground">SMS</Text>
            <Switch
              value={notifSms}
              onValueChange={setNotifSms}
              trackColor={{ false: "#525252", true: "#0d9488" }}
              thumbColor="#f0fdfa"
            />
          </View>

          {/* Frequencia do digest */}
          <View className="gap-1.5 mt-1">
            <Text className="text-xs text-muted-foreground">
              Frequencia do Digest
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-2"
            >
              {DIGEST_FREQS.map((freq) => (
                <Pressable
                  key={freq}
                  onPress={() => setDigestFreq(freq)}
                  className={`px-3 py-1.5 rounded-lg border ${
                    digestFreq === freq
                      ? "bg-primary border-primary"
                      : "bg-background border-border"
                  }`}
                >
                  <Text
                    className={`text-xs font-medium ${
                      digestFreq === freq
                        ? "text-primary-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {DIGEST_LABELS[freq]}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {/* Quiet hours */}
          <View className="flex-row gap-3 mt-1">
            <View className="flex-1 gap-1.5">
              <Text className="text-xs text-muted-foreground">
                Quiet Hours Inicio (HH:MM)
              </Text>
              <TextInput
                value={quietStart}
                onChangeText={setQuietStart}
                placeholder="22:00"
                placeholderTextColor="#525252"
                keyboardType="numbers-and-punctuation"
                maxLength={5}
                className="rounded-lg bg-background border border-border px-3 py-2.5 text-sm text-foreground"
              />
            </View>
            <View className="flex-1 gap-1.5">
              <Text className="text-xs text-muted-foreground">
                Quiet Hours Fim (HH:MM)
              </Text>
              <TextInput
                value={quietEnd}
                onChangeText={setQuietEnd}
                placeholder="07:00"
                placeholderTextColor="#525252"
                keyboardType="numbers-and-punctuation"
                maxLength={5}
                className="rounded-lg bg-background border border-border px-3 py-2.5 text-sm text-foreground"
              />
            </View>
          </View>
        </View>

        {/* Aparencia */}
        <View className="rounded-lg bg-card p-4 border border-border gap-3">
          <Text className="text-sm font-semibold text-foreground">
            Aparencia
          </Text>

          {/* Tema */}
          <View className="gap-1.5">
            <Text className="text-xs text-muted-foreground">Tema</Text>
            <View className="flex-row gap-2">
              {THEMES.map((t) => (
                <Pressable
                  key={t}
                  onPress={() => setTheme(t)}
                  className={`flex-1 px-3 py-2 rounded-lg border items-center ${
                    theme === t
                      ? "bg-primary border-primary"
                      : "bg-background border-border"
                  }`}
                >
                  <Text
                    className={`text-xs font-medium ${
                      theme === t
                        ? "text-primary-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {THEME_LABELS[t]}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Densidade */}
          <View className="gap-1.5">
            <Text className="text-xs text-muted-foreground">Densidade</Text>
            <View className="flex-row gap-2">
              {DENSITIES.map((d) => (
                <Pressable
                  key={d}
                  onPress={() => setDensity(d)}
                  className={`flex-1 px-3 py-2 rounded-lg border items-center ${
                    density === d
                      ? "bg-primary border-primary"
                      : "bg-background border-border"
                  }`}
                >
                  <Text
                    className={`text-xs font-medium ${
                      density === d
                        ? "text-primary-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {DENSITY_LABELS[d]}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        {/* Botao salvar */}
        <Pressable
          onPress={handleSavePreferences}
          disabled={saving}
          className="rounded-lg bg-primary py-3.5 items-center"
          style={{ opacity: saving ? 0.5 : 1 }}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#f0fdfa" />
          ) : (
            <Text className="text-sm font-semibold text-primary-foreground">
              Salvar Preferencias
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
