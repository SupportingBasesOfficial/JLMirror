// Estado vazio — icone + titulo + subtitulo opcional
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  message: string;
  subtitle?: string;
}

export function EmptyState({ icon, message, subtitle }: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center px-6 py-12">
      <Ionicons name={icon} size={48} color="#525252" />
      <Text className="mt-4 text-center text-sm font-medium text-foreground">
        {message}
      </Text>
      {subtitle && (
        <Text className="mt-1 text-center text-xs text-muted-foreground">
          {subtitle}
        </Text>
      )}
    </View>
  );
}
