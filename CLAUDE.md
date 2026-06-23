# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
npm run dev        # Vite dev server (HMR). Served under the base path — open /german-tax-calculator/
npm test           # vitest run — tax self-checks + storage + component tests
npm run check      # svelte-check + tsc (type-check only)
npm run lint       # ESLint + Prettier --check (this is the CI gate)
npm run format     # Prettier --write (auto-fix)
npm run build      # static output to dist/
npm run preview    # serve the production build
```

Run a single test file or case with vitest:

```sh
npx vitest run src/tax.test.ts                 # one file
npx vitest run -t "capital income"             # by test name
npx vitest src/tax.test.ts                      # watch mode
```

## Architecture

Vite + Svelte 5 (runes) + TypeScript. Client-only; **all computation runs in the browser, nothing is sent anywhere.** Three source layers with a strict one-way dependency: `App.svelte` → `tax.ts` / `storage.ts`.

- **`src/tax.ts` — the calculation core.** Pure, typed, DOM-free functions. `calculate(input: HouseholdInput): TaxResult` is the single entry point the UI calls; everything else (`grundtarif`, `splittingTax`, `lohnsteuer`, `sv`, `capitalIncomeTax`, `soli`, rate helpers) composes into it. Per-year constants encode the §32a EStG tariff for 2023–2026 (married/jointly via splitting). Models: Progressionsvorbehalt for exempt Australian rent (lifts the rate, `costOfRent`/`specialRate`), Lohnsteuer per tax class III/IV/V, statutory health+care insurance, flat 25% Abgeltungsteuer on capital income with Australian withholding credit, freelance income, and Denkmal-AfA. **Treat the tariff coefficients and `tax.test.ts` as load-bearing** — they're verified against official figures; change them only with a source.

- **`src/storage.ts` — consent + persistence.** Reads/writes a single first-party cookie. The form is only persisted after the user accepts (functional cookie, no tracking). Theme/UI prefs are not part of this.

- **`src/App.svelte` — presentation only.** Holds the entire UI (markup + scoped styles) in one component. Uses runes: `$state` for inputs, `$derived` for `calculate(input)` and isolated "what-if" recomputes (e.g. tax with vs. without deductions/Denkmal), `$effect` to persist on change once consent is accepted. Layout is a two-pane shell: a sticky left **rail holding every input**, grouped into Household / Health & family / Income / Reliefs; the right side is **purely computed result cards** (each card owns its title; rows stretch to equal height).

### CSS is token-driven — change styling in one place

`App.svelte`'s `<style>` opens with a `:global(:root)` block of **design tokens** (palette, radii, spacing, and type-role variables like `--card-title-*`, `--label-*`, `--big-*`) plus shared classes (`.card`, `.card-title`, `.stat`, `.tile`, `.input`, `.pills`). To restyle globally (e.g. every card heading, or all corner radii), edit the token, not the markup. Avoid reintroducing one-off inline `style=` attributes.

## Gotchas

- **Component tests assert on specific rendered text** (e.g. "Health insurance (KV)", "Net income / month", "Tax payable without Denkmal", the III/IV/V buttons, `select#year`, and the first `input[type=number]` being "You · gross"). Renaming these labels will break `App.test.ts` — update the tests deliberately when you intend the change.
- **The `a11y_label_has_associated_control` warning is intentionally silenced** (labels sit above inputs without `for`/`id`). It's suppressed in both `svelte.config.js` and the `check` script flag — keep both in sync if you touch it.
- **Base path matters.** `vite.config.ts` sets `base: '/german-tax-calculator/'` for GitHub Pages, so the dev/preview app lives at `/german-tax-calculator/`, not `/`.

## CI / Deploy

`ci.yml` (PRs/branches) and `deploy.yml` (push to `main`) run the **same gate: lint → check → test → build**. A green `main` push publishes to GitHub Pages. There is no separate deploy step to run by hand — pushing `main` is the deploy.
