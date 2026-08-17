// @ai-context: .zero-error/architecture-map.md#ingress
// Config do Expo — bundle ID, permissions, plugins.
// Reusa o design system do web via NativeWind (TailwindCSS).
import type { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "JLMIRROR",
  slug: "jlmirror",
  version: "0.1.0",
  orientation: "portrait",
  scheme: "jlmirror",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  icon: "./assets/icon.png",
  splash: {
    image: "./assets/splash.png",
    resizeMode: "contain",
    backgroundColor: "#0B1015",
  },
  android: {
    package: "com.jlinformatica.jlmirror",
    permissions: ["CAMERA", "USE_BIOMETRIC"],
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#0B1015",
    },
  },
  ios: {
    bundleIdentifier: "com.jlinformatica.jlmirror",
    supportsTablet: true,
    infoPlist: {
      NSCameraUsageDescription:
        "Camera e usada para escanear QR codes de configuracao MFA.",
      NSFaceIDUsageDescription:
        "Face ID e usado para autenticacao biometrica no login.",
    },
    entitlements: {
      "com.apple.developer.applesignin": ["Default"],
    },
  },
  web: {
    bundler: "metro",
    output: "static",
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    [
      "expo-notifications",
      {
        color: "#0d9488",
      },
    ],
  ],
  experiments: {
    tsconfigPaths: true,
  },
  extra: {
    eas: {
      projectId: "f0e7cb38-e549-4905-99e5-aa7de0a6e1e3",
    },
  },
  updates: {
    url: "https://u.expo.dev/f0e7cb38-e549-4905-99e5-aa7de0a6e1e3",
  },
  runtimeVersion: {
    policy: "appVersion",
  },
});
