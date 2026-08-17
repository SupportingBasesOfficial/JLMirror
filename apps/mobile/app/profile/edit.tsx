// Editar perfil — dados pessoais + avatar customizavel
import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { api } from "@/lib/api-client";
import { apiRoutes, type ProfileResponse } from "@/lib/api-routes";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { ScreenHeader } from "@/components/ui/screen-header";

const AVATAR_COLORS = [
  "#1BA898",
  "#3E8BF0",
  "#8B5CF6",
  "#F5A623",
  "#E5484D",
  "#30A46C",
  "#EC4899",
  "#14B8A6",
];

const TIMEZONES = [
  "America/Sao_Paulo",
  "America/New_York",
  "America/Chicago",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "UTC",
];

export default function EditProfileScreen() {
  const queryClient = useQueryClient();
  const { data: profileData, isLoading } = useQuery<ProfileResponse>({
    queryKey: ["profile"],
    queryFn: () => api.get(apiRoutes.profile.get),
  });
  const profile = profileData?.profile;

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [phone, setPhone] = useState("");
  const [locationVal, setLocationVal] = useState("");
  const [timezone, setTimezone] = useState("America/Sao_Paulo");
  const [jobTitle, setJobTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [skills, setSkills] = useState("");
  const [avatarInitials, setAvatarInitials] = useState("");
  const [avatarColor, setAvatarColor] = useState("#1BA898");
  const [saving, setSaving] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name ?? "");
      setBio(profile.bio ?? "");
      setPhone(profile.phone ?? "");
      setLocationVal(profile.location ?? "");
      setTimezone(profile.timezone ?? "America/Sao_Paulo");
      setJobTitle(profile.job_title ?? "");
      setDepartment(profile.department ?? "");
      setSkills(Array.isArray(profile.skills) ? profile.skills.join(", ") : "");
      setAvatarInitials(profile.avatar_initials ?? "");
      setAvatarColor(profile.avatar_color ?? "#1BA898");
    }
  }, [profile]);

  async function handleSaveProfile() {
    setSaving(true);
    try {
      const skillsArr = skills
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      await api.put(apiRoutes.profile.update, {
        display_name: displayName,
        bio: bio || undefined,
        phone: phone || undefined,
        location: locationVal || undefined,
        timezone,
        job_title: jobTitle || undefined,
        department: department || undefined,
        skills: skillsArr,
      });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      Alert.alert("Sucesso", "Perfil atualizado!");
    } catch (err: unknown) {
      Alert.alert(
        "Erro",
        err instanceof Error ? err.message : "Falha ao salvar",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAvatar() {
    setSavingAvatar(true);
    try {
      await api.put(apiRoutes.profile.avatar, {
        avatar_initials: avatarInitials,
        avatar_color: avatarColor,
      });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      Alert.alert("Sucesso", "Avatar atualizado!");
    } catch (err: unknown) {
      Alert.alert(
        "Erro",
        err instanceof Error ? err.message : "Falha ao salvar avatar",
      );
    } finally {
      setSavingAvatar(false);
    }
  }

  if (isLoading) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader title="Editar Perfil" />
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
      <ScreenHeader title="Editar Perfil" />
      <ScrollView contentContainerClassName="px-4 pt-4 pb-8 gap-4">
        {/* Avatar */}
        <View className="items-center gap-3">
          <View
            className="w-20 h-20 rounded-full items-center justify-center"
            style={{
              backgroundColor: `${avatarColor}20`,
              borderWidth: 2,
              borderColor: avatarColor,
            }}
          >
            <Text className="text-2xl font-bold" style={{ color: avatarColor }}>
              {avatarInitials || "??"}
            </Text>
          </View>
        </View>

        {/* Avatar: iniciais + cores */}
        <View className="rounded-lg bg-card p-4 border border-border gap-3">
          <Text className="text-sm font-semibold text-foreground">Avatar</Text>
          <View className="gap-1.5">
            <Text className="text-xs text-muted-foreground">
              Iniciais (max 3)
            </Text>
            <TextInput
              value={avatarInitials}
              onChangeText={setAvatarInitials}
              placeholder="Ex: JL"
              placeholderTextColor="#525252"
              className="rounded-lg bg-background border border-border px-3 py-2 text-sm text-foreground"
              maxLength={3}
              autoCapitalize="characters"
            />
          </View>
          <View className="gap-1.5">
            <Text className="text-xs text-muted-foreground">Cor</Text>
            <View className="flex-row flex-wrap gap-2">
              {AVATAR_COLORS.map((color) => (
                <Pressable
                  key={color}
                  onPress={() => setAvatarColor(color)}
                  className="w-8 h-8 rounded-full items-center justify-center"
                  style={{
                    backgroundColor: color,
                    borderWidth: avatarColor === color ? 3 : 0,
                    borderColor: "#f0fdfa",
                  }}
                >
                  {avatarColor === color && (
                    <Ionicons name="checkmark" size={16} color="#f0fdfa" />
                  )}
                </Pressable>
              ))}
            </View>
          </View>
          <Pressable
            onPress={handleSaveAvatar}
            disabled={savingAvatar}
            className="rounded-lg bg-primary py-2.5 items-center"
            style={{ opacity: savingAvatar ? 0.5 : 1 }}
          >
            {savingAvatar ? (
              <ActivityIndicator size="small" color="#f0fdfa" />
            ) : (
              <Text className="text-sm font-semibold text-primary-foreground">
                Salvar Avatar
              </Text>
            )}
          </Pressable>
        </View>

        {/* Dados pessoais */}
        <View className="rounded-lg bg-card p-4 border border-border gap-3">
          <Text className="text-sm font-semibold text-foreground">
            Dados Pessoais
          </Text>

          <Field label="Nome de Exibicao">
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Seu nome"
              placeholderTextColor="#525252"
              className="rounded-lg bg-background border border-border px-3 py-2.5 text-sm text-foreground"
            />
          </Field>

          <Field label="Cargo">
            <TextInput
              value={jobTitle}
              onChangeText={setJobTitle}
              placeholder="Ex: Analista de infraestrutura"
              placeholderTextColor="#525252"
              className="rounded-lg bg-background border border-border px-3 py-2.5 text-sm text-foreground"
            />
          </Field>

          <Field label="Departamento">
            <TextInput
              value={department}
              onChangeText={setDepartment}
              placeholder="Ex: TI"
              placeholderTextColor="#525252"
              className="rounded-lg bg-background border border-border px-3 py-2.5 text-sm text-foreground"
            />
          </Field>

          <Field label="Telefone">
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="(11) 99999-9999"
              placeholderTextColor="#525252"
              keyboardType="phone-pad"
              className="rounded-lg bg-background border border-border px-3 py-2.5 text-sm text-foreground"
            />
          </Field>

          <Field label="Localizacao">
            <TextInput
              value={locationVal}
              onChangeText={setLocationVal}
              placeholder="Ex: Sao Paulo, SP"
              placeholderTextColor="#525252"
              className="rounded-lg bg-background border border-border px-3 py-2.5 text-sm text-foreground"
            />
          </Field>

          <Field label="Timezone">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-2"
            >
              {TIMEZONES.map((tz) => (
                <Pressable
                  key={tz}
                  onPress={() => setTimezone(tz)}
                  className={`px-3 py-1.5 rounded-lg border ${
                    timezone === tz
                      ? "bg-primary border-primary"
                      : "bg-background border-border"
                  }`}
                >
                  <Text
                    className={`text-xs font-medium ${
                      timezone === tz
                        ? "text-primary-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {tz}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </Field>

          <Field label="Bio">
            <TextInput
              value={bio}
              onChangeText={setBio}
              placeholder="Conte sobre voce..."
              placeholderTextColor="#525252"
              multiline
              className="rounded-lg bg-background border border-border px-3 py-2.5 text-sm text-foreground"
              style={{ minHeight: 80, textAlignVertical: "top" }}
              maxLength={500}
            />
          </Field>

          <Field label="Skills (separadas por virgula)">
            <TextInput
              value={skills}
              onChangeText={setSkills}
              placeholder="Ex: Linux, Zabbix, Docker"
              placeholderTextColor="#525252"
              className="rounded-lg bg-background border border-border px-3 py-2.5 text-sm text-foreground"
            />
          </Field>
        </View>

        {/* Botao salvar */}
        <Pressable
          onPress={handleSaveProfile}
          disabled={saving}
          className="rounded-lg bg-primary py-3.5 items-center"
          style={{ opacity: saving ? 0.5 : 1 }}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#f0fdfa" />
          ) : (
            <Text className="text-sm font-semibold text-primary-foreground">
              Salvar Perfil
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-1.5">
      <Text className="text-xs text-muted-foreground">{label}</Text>
      {children}
    </View>
  );
}
