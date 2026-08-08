import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef6ff",
          100: "#d9ecff",
          200: "#bcdfff",
          300: "#8eccff",
          400: "#59b0ff",
          500: "#328cff",
          600: "#1c6cf5",
          700: "#1656e0",
          800: "#1946b5",
          900: "#1a3e8f",
        },
      },
    },
  },
  plugins: [],
};

export default config;
