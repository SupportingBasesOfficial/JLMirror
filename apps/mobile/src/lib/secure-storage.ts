// @ai-context: .zero-error/architecture-map.md#ingress
// Secure storage — wrapper sobre expo-secure-store para persistir JWT.
// Usa Keychain (iOS) / Keystore (Android) — dados criptografados em repouso.
import * as SecureStore from "expo-secure-store";

const KEYS = {
  accessToken: "jlmirror_access_token",
  refreshToken: "jlmirror_refresh_token",
  userData: "jlmirror_user_data",
} as const;

export async function saveTokens(
  accessToken: string,
  refreshToken: string,
): Promise<void> {
  await SecureStore.setItemAsync(KEYS.accessToken, accessToken);
  await SecureStore.setItemAsync(KEYS.refreshToken, refreshToken);
}

export async function getAccessToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEYS.accessToken);
  } catch {
    return null;
  }
}

export async function getRefreshToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEYS.refreshToken);
  } catch {
    return null;
  }
}

export async function saveUserData(data: unknown): Promise<void> {
  await SecureStore.setItemAsync(KEYS.userData, JSON.stringify(data));
}

export async function getUserData<T>(): Promise<T | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEYS.userData);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function clearAll(): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS.accessToken);
  await SecureStore.deleteItemAsync(KEYS.refreshToken);
  await SecureStore.deleteItemAsync(KEYS.userData);
}
