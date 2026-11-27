import type { Config } from "tailwindcss";

/**
 * A theme token (a CSS variable holding a colour, globals.css) as a Tailwind
 * colour that takes opacity modifiers: bg-surface, bg-bg/80.
 */
const token = (variable: string) => `color-mix(in srgb, var(${variable}) calc(<alpha-value> * 100%), transparent)`;

export default {
  // Dark is the default theme; `data-theme="light"` on <html> switches (client/src/lib/theme.ts).
  darkMode: ["selector", ':root:not([data-theme="light"])'],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  // A hover style applies only where there is a pointer that hovers: on a touch screen a tapped
  // row is never left grey, so a fill can never be read as the row's state.
  future: {
    hoverOnlyWhenSupported: true,
  },
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
      // The type scale (the hierarchy pass, step 5): meta 13px, body 15px. Labels are 11 to 12px
      // (`labelClass`), section headings 20px, page titles 40px.
      fontSize: {
        xs: ['13px', { lineHeight: '18px' }],
        sm: ['15px', { lineHeight: '22px' }],
      },
      // A border with no colour named is a hairline.
      borderColor: {
        DEFAULT: "var(--line)",
      },
      colors: {
        // The eleven tokens (client/src/styles/globals.css): bg-bg, bg-surface, bg-surface-hover,
        // border-line, border-line-strong, text-text-1 / -2 / -3, bg-inverse-bg, text-inverse-text,
        // and the one accent (outline-accent, border-accent, bg-accent/[0.06]). Nothing here
        // defines a colour: each name is a token, and takes an opacity modifier.
        bg: {
          DEFAULT: token("--bg"),
        },
        surface: {
          DEFAULT: token("--surface"),
          hover: token("--surface-hover"),
        },
        line: {
          DEFAULT: token("--line"),
          strong: token("--line-strong"),
        },
        text: {
          1: token("--text-1"),
          2: token("--text-2"),
          3: token("--text-3"),
        },
        inverse: {
          bg: token("--inverse-bg"),
          text: token("--inverse-text"),
        },
        accent: token("--accent"),
        // An error has to read as one: errors and destructive actions, nothing else.
        danger: token("--danger"),
        // A company's mark is drawn for a white page (components/CompanyLogo.tsx).
        "logo-backing": token("--logo-backing"),
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
