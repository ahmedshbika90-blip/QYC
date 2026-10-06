/** @type {import('tailwindcss').Config} */

// Every colour the app uses resolves to a CSS variable (see
// styles/globals.css), so light/dark is a single class swap on <html>
// and every existing page picks up the new palette without edits.
// The five legacy families (gray, white, red, amber, green) are remapped
// onto the Masar palette; new code should prefer the semantic names.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
const scale = (family, steps) =>
  Object.fromEntries(steps.map((s) => [s, v(`${family}-${s}`)]));

const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];

module.exports = {
  darkMode: "class",
  content: ["./pages/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        white: v("white"),
        // True white in BOTH themes — for text on brand / photo / accent
        // backgrounds ("white" above is the surface colour and turns dark
        // in night mode, which made such text unreadable).
        snow: "#ffffff",
        // Deep colours that stay the same in night mode, for solid
        // buttons / badges that carry white text (text-snow).
        solid: { red: "#b9281e", amber: "#b45309", green: "#0b6e57", ink: "#26322c" },
        gray: scale("gray", STEPS),
        green: scale("green", STEPS),
        emerald: scale("green", STEPS),
        amber: scale("amber", STEPS),
        yellow: scale("amber", STEPS),
        orange: scale("amber", STEPS),
        red: scale("red", STEPS),
        blue: scale("blue", STEPS),
        sky: scale("blue", STEPS),

        // Semantic tokens — use these in new components.
        canvas: v("gray-50"),
        surface: { DEFAULT: v("white"), 2: v("gray-100") },
        ink: { DEFAULT: v("gray-900"), soft: v("gray-600") },
        muted: v("gray-500"),
        line: v("gray-200"),
        accent: { DEFAULT: v("accent"), strong: v("accent-strong"), soft: v("green-100"), ink: v("green-700") },
        "on-accent": v("on-accent"),
        warn: { DEFAULT: v("amber-700"), soft: v("amber-100") },
        danger: { DEFAULT: v("red-600"), soft: v("red-100") },
        info: { DEFAULT: v("blue-600"), soft: v("blue-100") },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans Arabic"', "ui-sans-serif", "system-ui", "sans-serif"],
        display: ['"Alexandria"', '"IBM Plex Sans Arabic"', "ui-sans-serif", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "0.5rem",
        lg: "0.875rem",
        xl: "1.125rem",
        "2xl": "1.375rem",
        "3xl": "1.75rem",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        DEFAULT: "var(--shadow)",
        md: "var(--shadow)",
        lg: "var(--shadow-lg)",
        xl: "var(--shadow-lg)",
      },
      spacing: {
        tabbar: "calc(4.75rem + env(safe-area-inset-bottom))",
      },
    },
  },
  plugins: [],
};
