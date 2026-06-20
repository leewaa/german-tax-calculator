# German Tax Calculator (Progressionsvorbehalt)

A single-page, client-side estimator for German income tax (2024, married/jointly) when
Australian rental income lifts the rate via *Progressionsvorbehalt* — plus tax classes,
statutory health insurance, children, Australian bank interest, freelance income, and a
fine-tuner (extra deductions + Denkmal-AfA).

**Approximate — for orientation only. Not tax advice.** All computation runs in your browser;
no data is sent anywhere.

## Develop

```sh
npm install
npm run dev      # dev server with hot reload
npm test         # tax self-checks + legacy-parity + component tests
npm run build    # static output in dist/
npm run preview  # serve the production build locally
```

## How it's built

Vite + Svelte + TypeScript. The tax math lives in `src/tax.ts` — pure, typed functions with
no UI dependency — and is covered three ways:

- `src/tax.test.ts` — the verified tax self-checks (tariff, Soli, Lohnsteuer by class,
  insurance rates, capital income, freelance, Denkmal-AfA).
- `src/parity.test.ts` — diffs the typed module against the original single-file version
  (kept in `legacy/`) across thousands of scenarios, to the euro.
- `src/App.test.ts` — component tests: renders, recomputes on input, shows the combo warning.

`src/App.svelte` is presentation only — it imports `calculate()` and renders the result.

## Deploy

Pushing to `main` triggers a GitHub Actions workflow that tests, builds, and publishes to
GitHub Pages.
