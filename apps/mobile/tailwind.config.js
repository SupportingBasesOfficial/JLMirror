/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require("nativewind/preset")],
  content: [
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0a0a0a",
        foreground: "#fafafa",
        card: {
          DEFAULT: "#171717",
          foreground: "#fafafa",
        },
        popover: {
          DEFAULT: "#171717",
          foreground: "#fafafa",
        },
        primary: {
          DEFAULT: "#0d9488",
          foreground: "#f0fdfa",
        },
        secondary: {
          DEFAULT: "#262626",
          foreground: "#fafafa",
        },
        muted: {
          DEFAULT: "#262626",
          foreground: "#a3a3a3",
        },
        accent: {
          DEFAULT: "#262626",
          foreground: "#fafafa",
        },
        destructive: {
          DEFAULT: "#dc2626",
          foreground: "#fafafa",
        },
        border: "#262626",
        input: "#262626",
        ring: "#0d9488",
      },
      borderRadius: {
        lg: "12px",
        md: "10px",
        sm: "8px",
      },
    },
  },
  plugins: [],
};
