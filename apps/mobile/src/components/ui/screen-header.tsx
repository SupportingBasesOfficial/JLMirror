// Header reutilizavel para telas de detalhe — botao voltar + titulo + acoes opcionais
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  /** Renderizado a direita do titulo (botoes de acao, toggles, etc) */
  right?: React.ReactNode;
  /** Se false, nao mostra o botao voltar (default: true) */
  showBack?: boolean;
}

export function ScreenHeader({
  title,
  subtitle,
  right,
  showBack = true,
}: ScreenHeaderProps) {
  const router = useRouter();

  return (
    <View className="flex-row items-center gap-3 px-4 pt-12 pb-3 bg-background border-b border-border">
      {showBack && (
        <Pressable
          onPress={() => router.back()}
          className="active:opacity-70 shrink-0"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color="#0d9488" />
        </Pressable>
      )}
      <View className="flex-1 min-w-0">
        <Text className="text-lg font-bold text-foreground" numberOfLines={1}>
          {title}
        </Text>
        {subtitle && (
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      {right && <View className="shrink-0">{right}</View>}
    </View>
  );
}
