/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./apps/web/index.html",
    "./apps/web/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "var(--cm-line)",
        input: "var(--cm-line)",
        ring: "var(--cm-blue)",
        background: "var(--cm-base)",
        foreground: "var(--cm-text)",
        primary: {
          DEFAULT: "var(--cm-blue)",
          foreground: "#ffffff",
        },
        secondary: {
          DEFAULT: "var(--cm-raised)",
          foreground: "var(--cm-text)",
        },
        destructive: {
          DEFAULT: "var(--cm-error)",
          foreground: "#ffffff",
        },
        muted: {
          DEFAULT: "var(--cm-hover)",
          foreground: "var(--cm-text-secondary)",
        },
        accent: {
          DEFAULT: "var(--cm-hover)",
          foreground: "var(--cm-text)",
        },
        popover: {
          DEFAULT: "var(--cm-panel)",
          foreground: "var(--cm-text)",
        },
        card: {
          DEFAULT: "var(--cm-raised)",
          foreground: "var(--cm-text)",
        },
        cm: {
          void: "var(--cm-void)",
          base: "var(--cm-base)",
          panel: "var(--cm-panel)",
          raised: "var(--cm-raised)",
          hover: "var(--cm-hover)",
          pressed: "var(--cm-pressed)",
          line: "var(--cm-line)",
          "line-strong": "var(--cm-line-strong)",
          blue: "var(--cm-blue)",
          "blue-hover": "var(--blue-hover)",
          "blue-text": "var(--cm-blue-text)",
          mentor: "var(--cm-mentor)",
          text: "var(--cm-text)",
          "text-secondary": "var(--cm-text-secondary)",
          "text-tertiary": "var(--cm-text-tertiary)",
          error: "var(--cm-error)",
          success: "var(--cm-success)",
          warning: "var(--cm-warning)",
        },
      },
      borderRadius: {
        lg: "var(--cm-r-md)",
        md: "var(--cm-r-sm)",
        sm: "var(--cm-r-xs)",
        xl: "var(--cm-r-lg)",
      },
      fontFamily: {
        sans: ["var(--font-primary)", "-apple-system", "BlinkMacSystemFont", "SF Pro Text", "sans-serif"],
        mono: ["var(--font-mono)", "SF Mono", "monospace"],
      },
    },
  },
  plugins: [],
};

