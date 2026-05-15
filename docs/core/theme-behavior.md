# Theme Behavior

Stockker supports three appearance modes: `light`, `dark`, and `system`.

## Runtime Model

- `next-themes` owns the selected mode and persists it in browser `localStorage`.
- `ThemeProvider` is configured in `src/app/layout.tsx` with `attribute="class"`, `defaultTheme="system"`, and `enableSystem`.
- Tailwind v4 dark styles are bound to the class strategy through `@custom-variant dark (&:where(.dark, .dark *));`.
- `body` consumes `bg-background text-foreground`, and app page roots use the same tokens so the full surface changes together.

## Token Contract

`src/app/globals.css` defines light and dark values for:

- `--background`, `--foreground`
- `--card`, `--card-foreground`
- `--popover`, `--popover-foreground`
- `--muted`, `--muted-foreground`
- `--border`, `--input`, `--ring`
- `--primary`, `--primary-foreground`
- `--secondary`, `--secondary-foreground`
- `--destructive`

These are mapped into Tailwind inline theme colors such as `bg-background`, `text-foreground`, `bg-card`, and `border-border`.

## UX Rules

- The header exposes explicit icon buttons for light, dark, and system.
- Reloads and navigation preserve the selected mode through `next-themes`.
- New page shells should use `bg-background text-foreground`, not hard-coded root surface colors.
- Component-specific colors may still use contextual `dark:` variants, but the full app background must remain token-driven.
