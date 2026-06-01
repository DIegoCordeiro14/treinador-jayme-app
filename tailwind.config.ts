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
        brand: {
          DEFAULT: "#2563eb",
          50: "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          800: "#1e40af",
          900: "#1e3a8a",
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
          "0%": { transform: "scale(0.95)", boxShadow: "0 0 0 0 rgba(37, 99, 235, 0.7)" },
          "70%": { transform: "scale(1)", boxShadow: "0 0 0 10px rgba(37, 99, 235, 0)" },
          "100%": { transform: "scale(0.95)", boxShadow: "0 0 0 0 rgba(37, 99, 235, 0)" },
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
        "gradient-card": "linear-gradient(135deg, rgba(37,99,235,0.1) 0%, rgba(37,99,235,0.02) 100%)",
      },
      boxShadow: {
        "glow-blue": "0 0 20px rgba(37, 99, 235, 0.3)",
        "glow-blue-sm": "0 0 10px rgba(37, 99, 235, 0.2)",
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
