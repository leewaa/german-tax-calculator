# German Tax Calculator (Progressionsvorbehalt)

A single-page, client-side estimator for German income tax (2024, married/jointly) when
Australian rental income lifts the rate via _Progressionsvorbehalt_ — plus tax classes,
statutory health insurance, children, Australian bank interest, freelance income, and a
fine-tuner (extra deductions + Denkmal-AfA).

**Approximate — for orientation only. Not tax advice.** All computation runs in your browser;
no data is sent anywhere.

## Develop

```sh
npm install
npm run dev      # dev server with hot reload
npm run lint     # ESLint + Prettier (check)
npm run format   # auto-fix formatting with Prettier
npm run check    # svelte-check + tsc type-check
npm test         # tax self-checks + storage + component tests
npm run build    # static output in dist/
npm run preview  # serve the production build locally
```

## How it's built

Vite + Svelte + TypeScript. The tax math lives in `src/tax.ts` — pure, typed functions with
no UI dependency — and is covered three ways:

- `src/tax.test.ts` — the tax self-checks, asserted against the official 2024 tariff figures
  (tariff, Soli, Lohnsteuer by class, insurance rates, capital income, freelance, Denkmal-AfA).
- `src/storage.test.ts` — cookie consent + form persistence round-trip.
- `src/App.test.ts` — component tests: renders, recomputes on input, shows the combo warning,
  cookie banner accept/decline.

`src/App.svelte` is presentation only — it imports `calculate()` and renders the result.

## CI / Deploy

- **Pull requests & branches** run `.github/workflows/ci.yml` — lint, type-check, test, build.
- **Push to `main`** runs `.github/workflows/deploy.yml` — the same gate (lint → check → test →
  build), then publishes to GitHub Pages only if all of it passes.
