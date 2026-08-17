/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: "#111B27",
          700: "#1C2A3A",
          500: "#2F4256",
          100: "#E8EEF3"
        },
        accent: {
          DEFAULT: "#FF5A36",
          dark: "#E04522",
          light: "#FFE8E1"
        },
        surface: {
          DEFAULT: "#FFFFFF",
          muted: "#F7F3EA",
          border: "#DDE4EA"
        },
        slate: {
          DEFAULT: "#6B7280"
        },
        warn: { DEFAULT: "#B45309", light: "#FEF3C7" },
        alertRed: { DEFAULT: "#B91C1C", light: "#FEE2E2" }
      },
      fontFamily: {
        sans: ["Satoshi", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Fraunces", "Georgia", "serif"]
      },
      boxShadow: {
        card: "0 1px 2px rgba(17, 27, 39, 0.04), 0 8px 24px rgba(17, 27, 39, 0.06)"
      },
      maxWidth: { content: "72rem" }
    }
  },
  plugins: []
};
