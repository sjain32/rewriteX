import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";
const config: Config = {
  // Specifies that dark mode is controlled by a class (typically added to the <html> element)
  darkMode: 'class',
  // Tells Tailwind where to look for class names to include in the generated CSS.
  // It's crucial to include paths to where your components and pages live.
  content: [
    './src/pages/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  // Prefix for Tailwind utility classes (optional, usually empty)
  prefix: "",
  theme: {
    // Configures the 'container' class behavior
    container: {
      center: true, // Centers the container by default
      padding: "2rem", // Adds default horizontal padding
      screens: {
        "2xl": "1400px", // Sets the max-width of the container on large screens
      },
    },
    // Extends the default Tailwind theme
    extend: {
      // Defines custom colors using CSS variables defined in globals.css
      // This allows Tailwind utilities like `bg-primary`, `text-secondary` to work
      // with ShadCN's theming system.
      colors: {
        border: "hsl(var(--border))", // Color for borders
        input: "hsl(var(--input))",   // Color for input borders/backgrounds
        ring: "hsl(var(--ring))",     // Color for focus rings
        background: "hsl(var(--background))", // Main background color
        foreground: "hsl(var(--foreground))", // Main text color
        primary: { // Primary color palette (e.g., for buttons)
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: { // Secondary color palette
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: { // Color palette for destructive actions (e.g., delete buttons)
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: { // Muted color palette (for less prominent elements)
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: { // Accent color palette
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: { // Colors for popover elements (like dropdowns)
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: { // Colors for card elements
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      // Defines custom border radius values using CSS variables
      // Allows utilities like `rounded-lg`, `rounded-md` to respect ShadCN's theme.
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      // Defines custom CSS keyframes for animations
      keyframes: {
        "accordion-down": { // Animation for opening an accordion
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": { // Animation for closing an accordion
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "float": {
          "0%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
          "100%": { transform: "translateY(0px)" },
        },
        "pulse-glow": {
          "0%": { boxShadow: "0 0 0 0 hsla(var(--primary) / 0.4)" },
          "70%": { boxShadow: "0 0 0 10px hsla(var(--primary) / 0)" },
          "100%": { boxShadow: "0 0 0 0 hsla(var(--primary) / 0)" },
        },
      },
      // Defines custom animation utilities based on the keyframes
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.6s ease-out forwards",
        "float": "float 6s ease-in-out infinite",
        "pulse-glow": "pulse-glow 2s infinite",
      },
    },
  },
  // Includes the tailwindcss-animate plugin to enable animation utilities
  plugins: [animate],
}

export default config;