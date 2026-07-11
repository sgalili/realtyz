import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      fontFamily: {
        sans: ["Plus Jakarta Sans", "Assistant", "Heebo", "Inter", "system-ui", "sans-serif"],
        heading: ["Playfair Display", "Assistant", "Heebo", "Inter", "system-ui", "serif"],
        display: ["Playfair Display", "Assistant", "Heebo", "Inter", "system-ui", "serif"],
        hebrew: ["Assistant", "Heebo", "Plus Jakarta Sans", "system-ui", "sans-serif"],
        serif: ["Playfair Display", "Georgia", "serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          glow: "hsl(var(--primary-glow))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        whatsapp: {
          header: "hsl(var(--whatsapp-header))",
          "header-foreground": "hsl(var(--whatsapp-header-foreground))",
          chat: "hsl(var(--whatsapp-chat))",
          footer: "hsl(var(--whatsapp-footer))",
          "bubble-out": "hsl(var(--whatsapp-bubble-out))",
          "bubble-in": "hsl(var(--whatsapp-bubble-in))",
          accent: "hsl(var(--whatsapp-accent))",
        },
        social: {
          whatsapp: "hsl(var(--social-whatsapp))",
          sms: "hsl(var(--social-sms))",
          instagram: "hsl(var(--social-instagram))",
          telegram: "hsl(var(--social-telegram))",
          messenger: "hsl(var(--social-messenger))",
          linkedin: "hsl(var(--social-linkedin))",
          tiktok: "hsl(var(--social-tiktok))",
          signal: "hsl(var(--social-signal))",
          x: "hsl(var(--social-x))",
          facebook: "hsl(var(--social-facebook))",
          email: "hsl(var(--social-email))",
          foreground: "hsl(var(--social-foreground))",
        },
        brand: {
          navy: "hsl(var(--brand-navy))",
          blue: "hsl(var(--brand-blue))",
          deep: "hsl(var(--brand-deep))",
          gold: "hsl(var(--brand-gold))",
          "gold-soft": "hsl(var(--brand-gold-soft))",
          silver: "hsl(var(--brand-silver))",
          cream: "hsl(var(--brand-cream))",
        },
        /* Backwards-compat alias so leftover `text-gold`/`bg-gold` JSX
           still compiles and renders against the warm gold accent. */
        gold: {
          DEFAULT: "hsl(var(--brand-gold))",
          deep: "hsl(var(--brand-navy))",
          soft: "hsl(var(--brand-gold-soft))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        soft: "0 1px 2px 0 rgba(17, 24, 39, 0.04), 0 4px 14px -4px rgba(17, 24, 39, 0.08)",
        elegant: "0 10px 40px -12px hsl(222 39% 14% / 0.18), 0 2px 8px -2px hsl(222 39% 14% / 0.06)",
        gold: "0 8px 24px -10px hsl(38 52% 58% / 0.45)",
      },
      spacing: {
        "section": "5rem",
        "section-sm": "3rem",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { transform: "scale(0.95)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(1)", opacity: "0.6" },
          "100%": { transform: "scale(2.5)", opacity: "0" },
        },
        "count-up": {
          "0%": { transform: "translateY(100%)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "slide-down-smooth": {
          "0%":   { opacity: "0", transform: "translateY(-8px)", maxHeight: "0px" },
          "100%": { opacity: "1", transform: "translateY(0)",     maxHeight: "600px" },
        },
        "slide-up-smooth": {
          "0%":   { opacity: "1", transform: "translateY(0)",     maxHeight: "600px" },
          "100%": { opacity: "0", transform: "translateY(-8px)",  maxHeight: "0px" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.4s ease-out",
        "scale-in": "scale-in 0.3s ease-out",
        "pulse-ring": "pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "count-up": "count-up 0.3s ease-out",
        "slide-down-smooth": "slide-down-smooth 0.38s cubic-bezier(0.22, 1, 0.36, 1) both",
        "slide-up-smooth":   "slide-up-smooth 0.32s cubic-bezier(0.4, 0, 0.2, 1) both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
