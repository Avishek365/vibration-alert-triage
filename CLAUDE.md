# CLAUDE.md

Machine-health triage tool. React 19 + TypeScript + Vite, Tailwind v4, Vitest, Oxlint.

## Project identity

- This is a **personal portfolio project**, not an employer product.
- No employer, client or company names, tokens, colours or fonts. Use only the neutral tokens in `src/styles/tokens.css`.

## Visual rules

- **Red, amber and green are reserved for machine health.** Never use them for buttons, links, branding or decoration. Use the `--health-*` tokens.
- **Healthy is a plain dot, not a filled pill.** Only states that need attention (Critical, Warning) get a filled or tinted badge.
- **Indigo is the single accent** (`--ui-accent`, `--ui-accent-hover`, `--ui-accent-subtle`, `--ui-focus-ring`). Do not add a second accent colour.
- **Inter is the only font** (`@fontsource-variable/inter`). Do not add other font families.
- **Never show health with colour alone.** Every health state needs a distinct shape/icon and a text label as well as colour, so it reads without colour vision and in greyscale.

## Dependencies

- Pin exact versions. No `^` or `~` (`.npmrc` sets `save-exact=true`).
- Commit `package-lock.json`; use `npm ci` in CI.

## Working rules

- **Ask before running any command.** That includes installs, scripts, git and the dev server.
- **Never add a git remote or push.** Commits stay local.

## Commands

- `npm run dev`: dev server at http://localhost:5173/
- `npm run build`: type-check (`tsc -b`) and production build
- `npm run lint`: Oxlint
- `npm run test:run`: Vitest, single run
- `npm run audit:a11y`: axe in headless Chrome on the queue and detail screens (start `npm run dev` first)
