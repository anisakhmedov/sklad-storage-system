import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      colors: {
        brand: {
          50: "#f0f5ff",
          100: "#e0eaff",
          200: "#bfd4ff",
          300: "#8fb3ff",
          400: "#5c8bff",
          500: "#3868f5",
          600: "#2748db",
          700: "#2138b3",
          800: "#1f3290",
          900: "#1d2c72",
          950: "#141b46",
        },
        ink: {
          50: "#f7f8fa",
          100: "#eef0f4",
          200: "#dde1e8",
          300: "#c3c9d4",
          400: "#98a1b3",
          500: "#717c92",
          600: "#545e74",
          700: "#3d465a",
          800: "#272e3d",
          900: "#171b26",
          950: "#0d0f16",
        },
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(15 23 42 / 0.04)",
        soft: "0 1px 2px 0 rgb(15 23 42 / 0.03), 0 1px 8px -2px rgb(15 23 42 / 0.06)",
        card: "0 1px 3px 0 rgb(15 23 42 / 0.04), 0 8px 24px -12px rgb(15 23 42 / 0.10)",
        "card-hover": "0 2px 6px 0 rgb(15 23 42 / 0.06), 0 16px 32px -14px rgb(15 23 42 / 0.16)",
        popover: "0 12px 40px -8px rgb(15 23 42 / 0.22), 0 4px 12px -4px rgb(15 23 42 / 0.10)",
        "focus-brand": "0 0 0 3.5px rgb(56 104 245 / 0.16)",
      },
      borderRadius: {
        xl: "0.85rem",
        "2xl": "1.1rem",
        "3xl": "1.5rem",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "slide-in-right": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        "slide-in-left": {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out",
        "fade-up": "fade-up 0.35s cubic-bezier(0.16,1,0.3,1)",
        "scale-in": "scale-in 0.18s cubic-bezier(0.16,1,0.3,1)",
        "slide-in-right": "slide-in-right 0.25s cubic-bezier(0.16,1,0.3,1)",
        "slide-in-left": "slide-in-left 0.25s cubic-bezier(0.16,1,0.3,1)",
        shimmer: "shimmer 1.6s infinite linear",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #2138b3 0%, #3868f5 52%, #5c8bff 100%)",
        "shimmer-gradient":
          "linear-gradient(90deg, rgb(238 240 244) 0px, rgb(248 249 251) 40px, rgb(238 240 244) 80px)",
      },
    },
  },
  plugins: [],
};

export default config;
