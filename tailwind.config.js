/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Tokens are driven by CSS variables (see styles.css) so the whole app
        // can swap between light and dark. `<alpha-value>` keeps `/opacity`
        // utilities like `bg-accent/10` working.
        ink: {
          DEFAULT: "rgb(var(--ink) / <alpha-value>)",
          light: "rgb(var(--ink-light) / <alpha-value>)",
          faint: "rgb(var(--ink-faint) / <alpha-value>)",
        },
        surface: {
          DEFAULT: "rgb(var(--surface) / <alpha-value>)",
          sidebar: "rgb(var(--surface-sidebar) / <alpha-value>)",
          hover: "rgb(var(--surface-hover) / <alpha-value>)",
          active: "rgb(var(--surface-active) / <alpha-value>)",
        },
        line: "rgb(var(--line) / <alpha-value>)",
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          soft: "rgb(var(--accent-soft) / <alpha-value>)",
          hover: "rgb(var(--accent-hover) / <alpha-value>)",
        },
        // Deliberately-dark chip (brand mark, record pill, toast) — stays dark
        // in both themes, unlike `ink` which flips to a light text color.
        chip: {
          DEFAULT: "rgb(var(--chip) / <alpha-value>)",
          fg: "rgb(var(--chip-fg) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Helvetica",
          "Apple Color Emoji",
          "Arial",
          "sans-serif",
        ],
      },
      fontSize: {
        "page-title": ["40px", { lineHeight: "1.2", fontWeight: "700" }],
      },
      boxShadow: {
        panel: "0 0 0 1px rgba(15,15,15,0.05), 0 3px 6px rgba(15,15,15,0.1), 0 9px 24px rgba(15,15,15,0.2)",
      },
    },
  },
  plugins: [],
};
