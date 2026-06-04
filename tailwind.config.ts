import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── Coach EDN mockup palette: blue-tinted dark grays replace neutral zinc ──
        zinc: {
          50: "#F7FAFB",
          100: "#F0F4F6",
          200: "#D7E0E5",
          300: "#B0C2CB",
          400: "#8FA3AD",
          500: "#607D8B",
          600: "#46606E",
          700: "#2C3E4A",
          800: "#1C2933",
          900: "#0D1117",
          950: "#07090B",
        },
        // Muted status tones from the mockup (--pos / --warn / --neg)
        green: {
          300: "#8FBCA0",
          400: "#6FA383",
          500: "#5A8A6A",
          600: "#4A7359",
          700: "#3A5A46",
        },
        emerald: {
          300: "#8FBCA0",
          400: "#6FA383",
          500: "#5A8A6A",
          600: "#4A7359",
          700: "#3A5A46",
          950: "#16241B",
        },
        red: {
          300: "#C99A9A",
          400: "#B07A7A",
          500: "#8B5A5A",
          600: "#7A4A4A",
          700: "#5F3A3A",
        },
        yellow: {
          300: "#D4B27A",
          400: "#C49A5A",
          500: "#A67C3A",
          600: "#8F6A30",
          700: "#705426",
        },
        brand: {
          DEFAULT: "#D4853A",
          50: "#fdf4ec",
          100: "#fae4cc",
          200: "#f5c999",
          300: "#efad66",
          400: "#e89244",
          500: "#D4853A",
          600: "#b8702e",
          700: "#9c5c24",
          800: "#80491a",
          900: "#663810",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "sans-serif"],
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-in-out",
        "slide-up": "slideUp 0.3s ease-out",
        "slide-down": "slideDown 0.3s ease-out",
        "pulse-ring": "pulseRing 1.5s cubic-bezier(0.215, 0.61, 0.355, 1) infinite",
        "spin-slow": "spin 3s linear infinite",
        "bounce-subtle": "bounceSubtle 2s ease-in-out infinite",
        "count-up": "countUp 0.5s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        slideDown: {
          "0%": { transform: "translateY(-10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        pulseRing: {
          "0%": { transform: "scale(0.95)", boxShadow: "0 0 0 0 rgba(212,133,58,0.7)" },
          "70%": { transform: "scale(1)", boxShadow: "0 0 0 10px rgba(212,133,58,0)" },
          "100%": { transform: "scale(0.95)", boxShadow: "0 0 0 0 rgba(212,133,58,0)" },
        },
        bounceSubtle: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-4px)" },
        },
        countUp: {
          "0%": { transform: "translateY(20px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic": "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
        "gradient-hero": "linear-gradient(135deg, #09090b 0%, #18181b 50%, #09090b 100%)",
        "gradient-card": "linear-gradient(135deg, rgba(212,133,58,0.1) 0%, rgba(212,133,58,0.02) 100%)",
      },
      boxShadow: {
        "glow-blue": "0 0 20px rgba(212,133,58,0.3)",
        "glow-blue-sm": "0 0 10px rgba(212,133,58,0.2)",
        card: "0 4px 6px -1px rgba(0, 0, 0, 0.5), 0 2px 4px -2px rgba(0, 0, 0, 0.3)",
        "card-hover": "0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -4px rgba(0, 0, 0, 0.3)",
      },
    },
  },
  plugins: [
    function ({ addUtilities }: { addUtilities: (u: Record<string, Record<string, string>>) => void }) {
      addUtilities({
        ".pb-safe": { paddingBottom: "env(safe-area-inset-bottom, 0px)" },
        ".pt-safe": { paddingTop: "env(safe-area-inset-top, 0px)" },
        ".pl-safe": { paddingLeft: "env(safe-area-inset-left, 0px)" },
        ".pr-safe": { paddingRight: "env(safe-area-inset-right, 0px)" },
        ".mb-safe": { marginBottom: "env(safe-area-inset-bottom, 0px)" },
      });
    },
  ],
};

export default config;
