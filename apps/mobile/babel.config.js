// Babel config — Expo SDK 54 + NativeWind v4.2.6 + Reanimated v4.
// O nativewind/babel 4.2.x inclui react-native-worklets/plugin automaticamente
// (necessario para Reanimated v4). NAO adicionar react-native-reanimated/plugin
// separadamente — causa "Duplicate plugin/preset detected".
// Ref: https://expo.dev/blog/expo-sdk-upgrade-guide
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
  };
};
