import type { StorybookConfig } from "@storybook/react-vite";

import path from "node:path";

const config: StorybookConfig = {
  stories: ["../packages/ui/src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-essentials"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  viteConfig: async () => {
    const { mergeConfig } = await import("vite");

    return mergeConfig(
      {
        resolve: {
          alias: {
            "@repo/ui": path.resolve(__dirname, "../packages/ui/src"),
          },
        },
      },
      {},
    );
  },
};

export default config;
