import type { Config } from "tailwindcss";

/**
 * A theme token (a CSS variable holding a colour, globals.css) as a Tailwind
 * colour that takes opacity modifiers: bg-bg-surface, bg-bg-surface/90.
 */
const token = (variable: string) => `color-mix(in srgb, var(${variable}) calc(<alpha-value> * 100%), transparent)`;

export default {
  // Dark is the default theme; `data-theme="light"` on <html> switches (client/src/lib/theme.ts).
  darkMode: ["selector", ':root:not([data-theme="light"])'],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      screens: {
        xs: '375px',
      },
      fontFamily: {
        sans: ['Oxanium Variable', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'Noto Sans', 'sans-serif'],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      colors: {
        // The app's own tokens: surfaces, text, lines. Class names read
        // bg-bg-surface, text-fg-muted, border-border-subtle.
        bg: {
          shell: token("--color-bg-shell"),
          base: token("--color-bg-base"),
          surface: token("--color-bg-surface"),
          elevated: token("--color-bg-elevated"),
        },
        fg: {
          default: token("--color-fg-default"),
          muted: token("--color-fg-muted"),
          soft: token("--color-fg-soft"),
        },
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
          primary: token("--color-accent-primary"),
          soft: token("--color-accent-soft"),
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        // Meaning and wash, per theme (globals.css). Use these, never a palette colour.
        success: "rgb(var(--success) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)",
        warning: "rgb(var(--warning) / <alpha-value>)",
        info: "rgb(var(--info) / <alpha-value>)",
        tint: "rgb(var(--tint) / <alpha-value>)",
        border: {
          DEFAULT: "hsl(var(--border))",
          subtle: token("--color-border-subtle"),
          strong: token("--color-border-strong"),
        },
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
