/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          950: "#070d19",
          900: "#0b1426",
          800: "#111e38",
          700: "#1a2b4c",
          600: "#243b66",
        },
        brand: {
          50: "#eef4ff",
          100: "#dbe7ff",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 3px rgba(11, 20, 38, 0.06), 0 1px 2px rgba(11, 20, 38, 0.04)",
        elevated: "0 10px 30px -10px rgba(11, 20, 38, 0.14)",
      },
    },
  },
  plugins: [],
};
