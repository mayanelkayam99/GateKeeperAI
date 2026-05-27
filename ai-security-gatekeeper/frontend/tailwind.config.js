/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./App.jsx",
    "./main.jsx",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      colors: {
        surface: {
          950: "#070b12",
          900: "#0c1220",
          800: "#111827",
          700: "#1a2332",
          600: "#243044",
        },
        accent: {
          cyan: "#22d3ee",
          blue: "#3b82f6",
        },
      },
      boxShadow: {
        "glow-red": "0 0 24px rgba(239, 68, 68, 0.35), 0 0 48px rgba(239, 68, 68, 0.15)",
        "glow-amber": "0 0 24px rgba(245, 158, 11, 0.35), 0 0 48px rgba(245, 158, 11, 0.15)",
        "glow-green": "0 0 24px rgba(34, 197, 94, 0.35), 0 0 48px rgba(34, 197, 94, 0.15)",
        "glow-blue": "0 0 24px rgba(59, 130, 246, 0.25)",
      },
      animation: {
        "pulse-slow": "pulse 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [],
};
