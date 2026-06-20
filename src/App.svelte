<script lang="ts">
  import {
    calculate, TAX_YEARS,
    type TaxClass, type TaxYear, type HouseholdInput, type PersonResult,
  } from './tax'
  import { getConsent, setConsent, saveForm, loadForm, clearForm, type Consent } from './storage'

  // If the user previously accepted, rehydrate the saved form; otherwise use dummy defaults.
  const savedForm = (typeof document !== 'undefined' && getConsent() === 'accepted') ? loadForm() : null

  let year = $state<TaxYear>(savedForm?.year ?? 2024)

  // Defaults are ROUND DUMMY NUMBERS — never real personal figures.
  let grossYou = $state(savedForm?.grossYou ?? 70000)
  let classYou = $state<TaxClass>(savedForm?.classYou ?? 'III')
  let grossWife = $state(savedForm?.grossWife ?? 35000)
  let classWife = $state<TaxClass>(savedForm?.classWife ?? 'V')
  let ausRent = $state(savedForm?.ausRent ?? 12000)
  let freelance = $state(savedForm?.freelance ?? 0)
  let zusatzPct = $state(savedForm?.zusatzPct ?? 1.7)
  let kids = $state(savedForm?.kids ?? 0)
  let interest = $state(savedForm?.interest ?? 3000)
  let deductions = $state(savedForm?.deductions ?? 0)
  let denkmalCost = $state(savedForm?.denkmalCost ?? 0)

  const input = $derived<HouseholdInput>({
    year, grossYou, classYou, grossWife, classWife, ausRent,
    zusatzPct, kids, interest, freelance, deductions, denkmalCost,
  })

  // Cookie consent: banner shows only until a choice is made.
  let consent = $state<Consent>(typeof document !== 'undefined' ? getConsent() : null)
  // Persist on every change, but only once the user has accepted.
  $effect(() => {
    if (consent === 'accepted') saveForm(input)
  })
  function acceptCookies() {
    setConsent('accepted')
    saveForm(input)
    consent = 'accepted'
  }
  function declineCookies() {
    setConsent('declined')
    clearForm()
    consent = 'declined'
  }
  const r = $derived(calculate(input))
  const baseline = $derived(calculate({ ...input, deductions: 0, denkmalCost: 0 }))
  const saved = $derived(Math.max(0, baseline.annualTotal - r.annualTotal))

  // tax-class comparison: same total tax, differing monthly net / year-end balance
  const combos: [TaxClass, TaxClass][] = [['III', 'V'], ['V', 'III'], ['IV', 'IV']]
  const rows = $derived(combos.map(([a, b]) => {
    const rr = calculate({ ...input, classYou: a, classWife: b })
    return { a, b, net: (rr.p1.netA + rr.p2.netA) / 12, bal: rr.balance }
  }))
  const bestNet = $derived(Math.max(...rows.map((x) => x.net)))
  const richest = $derived(rows.reduce((mx, x) => (x.net > mx.net ? x : mx)))
  const closest = $derived(rows.reduce((mn, x) => (Math.abs(x.bal) < Math.abs(mn.bal) ? x : mn)))
  const comboValid = $derived(['III+V', 'IV+IV'].includes([classYou, classWife].slice().sort().join('+')))

  const eur = (n: number) =>
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
      .format(Math.round(n))
  const pct = (x: number) =>
    (x * 100).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %'
  const m = (p: PersonResult, key: keyof PersonResult) => (p[key] as number) / 12

  // capital-income note (mirrors legacy branches)
  const iNote = $derived.by(() => {
    const c = r.cap
    if (c.interest <= 0) return ''
    if (c.taxable <= 0)
      return `Fully covered by the €2,000 saver's allowance — no German tax. (Australia still withheld ${eur(c.auWHT)}, which isn't recovered here.)`
    if (c.auWHT > c.abgGross)
      return `The 10% Australian withholding (${eur(c.auWHT)}) exceeds the German tax on the part above the allowance, so it wipes out the German tax — but the excess foreign tax isn't refundable.`
    return `You've already paid ${eur(c.auCredit)} in Australia (credited), and owe ${eur(c.germanDue)} more in Germany on this interest.`
  })

  // reconciliation note (mirrors legacy refund / back-payment branches)
  const freeNote = $derived(
    r.freelance > 0
      ? ` Your freelance income adds about ${eur(r.freelanceTax)} of income tax with no withholding behind it — normally you'd pre-pay that via quarterly Vorauszahlungen, so treat it as already partly settled rather than a surprise bill.`
      : '',
  )
  const rNote = $derived(
    r.balance >= 0
      ? `You'd have over-withheld during the year and get this back. Note: the Australian rent's progression is already included in the true liability — without it, the refund would be larger.${freeNote}`
      : `You'd have under-withheld and owe this on your return. The Australian rent adds ${eur(r.costOfRent)} of progression tax that isn't in your monthly Lohnsteuer, pushing you toward a back-payment.${freeNote}`,
  )
  const comboNote = $derived(
    `Same total annual tax whichever you pick — only the timing moves. ${richest.a}+${richest.b} puts the most in your pocket monthly (${eur(richest.net)}), while ${closest.a}+${closest.b} lands closest to an even year-end settlement.`,
  )
</script>

<div class="wrap">
  <span class="tag">◆ Tax year {year} · Married / jointly</span>
  <h1>German Tax Calculator</h1>
  <p class="lede">Two incomes, your tax classes, and the Australian rent that lifts your German rate
    via <em>Progressionsvorbehalt</em> — shown as the annual bill, the monthly withholding, and the year-end balance.</p>

  <!-- ============ INPUTS ============ -->
  <div class="sec-title"><span class="n">1</span> Your household</div>
  <div class="grid" style="margin-bottom:16px">
    <div class="card">
      <div class="field year-field">
        <label for="year">Tax year</label>
        <select id="year" bind:value={year}>
          {#each TAX_YEARS as y}<option value={y}>{y}</option>{/each}
        </select>
      </div>
    </div>
  </div>
  {#if !comboValid}
    <div class="warn-box">⚠ A married couple can only run III + V (or V + III) or IV + IV. The annual bill is still correct, but the monthly withholding for this combo isn't a real-world option.</div>
  {/if}
  <div class="grid cols2">
    <div class="card">
      <h3>You</h3>
      <div class="field">
        <label>Gross annual salary</label>
        <div class="input"><span>€</span><input type="number" inputmode="numeric" min="0" step="1000" bind:value={grossYou}></div>
      </div>
      <div class="field">
        <label>Tax class (Steuerklasse)</label>
        <div class="classes">
          <button class:on={classYou === 'III'} onclick={() => (classYou = 'III')}>III</button
          ><button class:on={classYou === 'IV'} onclick={() => (classYou = 'IV')}>IV</button
          ><button class:on={classYou === 'V'} onclick={() => (classYou = 'V')}>V</button>
        </div>
      </div>
    </div>
    <div class="card">
      <h3>Your wife</h3>
      <div class="field">
        <label>Gross annual salary</label>
        <div class="input"><span>€</span><input type="number" inputmode="numeric" min="0" step="1000" bind:value={grossWife}></div>
      </div>
      <div class="field">
        <label>Tax class (Steuerklasse)</label>
        <div class="classes">
          <button class:on={classWife === 'III'} onclick={() => (classWife = 'III')}>III</button
          ><button class:on={classWife === 'IV'} onclick={() => (classWife = 'IV')}>IV</button
          ><button class:on={classWife === 'V'} onclick={() => (classWife = 'V')}>V</button>
        </div>
      </div>
    </div>
  </div>
  <div class="grid" style="margin-top:16px">
    <div class="card">
      <div class="row3">
        <div class="field">
          <label>Australian net rental income (€) — exempt, progression-relevant</label>
          <div class="input"><span>€</span><input type="number" inputmode="numeric" min="0" step="500" bind:value={ausRent}></div>
        </div>
        <div class="field">
          <label>Your freelance income (freiberuflich, taxable profit €)</label>
          <div class="input"><span>€</span><input type="number" inputmode="numeric" min="0" step="1000" bind:value={freelance}></div>
        </div>
        <div class="field">
          <label>Krankenkasse Zusatzbeitrag</label>
          <div class="input"><span style="left:auto;right:14px">%</span><input type="number" inputmode="decimal" min="0" max="5" step="0.1" bind:value={zusatzPct} style="padding-left:14px"></div>
        </div>
        <div class="field">
          <label>Children (under 25)</label>
          <div class="input"><input type="number" inputmode="numeric" min="0" max="10" step="1" bind:value={kids} style="padding-left:14px"></div>
        </div>
      </div>
    </div>
  </div>

  <!-- ============ ANNUAL BILL ============ -->
  <div class="sec-title"><span class="n">2</span> Annual bill — the truth (tax classes don't change this)</div>
  <div class="total">
    <div>
      <div class="lbl">Total tax owed in Germany</div>
      <div class="big">{eur(r.annualTotal)}</div>
      <div class="lbl" style="margin-top:8px">Income tax <b style="color:var(--ink)">{eur(r.incomeTax)}</b> · Soli <b style="color:var(--ink)">{eur(r.annualSoli)}</b></div>
    </div>
    <div class="rates">
      <div><div class="lbl">Effective rate</div><b>{pct(r.effective)}</b></div>
      <div><div class="lbl">Marginal rate</div><b>{pct(r.marginal)}</b></div>
    </div>
  </div>
  <div class="stats">
    <div class="stat"><div class="k">Combined taxable income (est. zvE)</div><div class="v">{eur(r.zvE)}</div></div>
    <div class="stat"><div class="k">Tax if the rent weren't counted</div><div class="v">{eur(r.taxNoRent)}</div></div>
    <div class="stat cost"><div class="k">Cost of the Australian rent (progression)</div><div class="v">+ {eur(r.costOfRent)}</div></div>
    <div class="stat"><div class="k">Special rate applied (bes. Steuersatz)</div><div class="v">{pct(r.specialRate)}</div></div>
  </div>

  <!-- ============ MONTHLY ============ -->
  <div class="sec-title"><span class="n">3</span> Monthly withholding — where the tax classes bite</div>
  <div class="card" style="padding:8px 8px 0">
    <table>
      <thead><tr><th>Per month</th><th>You <span class="cls-pill">{classYou}</span></th><th>Wife <span class="cls-pill">{classWife}</span></th><th>Together</th></tr></thead>
      <tbody>
        <tr><td>Gross</td><td>{eur(m(r.p1, 'g'))}</td><td>{eur(m(r.p2, 'g'))}</td><td>{eur(m(r.p1, 'g') + m(r.p2, 'g'))}</td></tr>
        <tr><td>− Social security</td><td>− {eur(m(r.p1, 'svA'))}</td><td>− {eur(m(r.p2, 'svA'))}</td><td>− {eur(m(r.p1, 'svA') + m(r.p2, 'svA'))}</td></tr>
        <tr><td>− Lohnsteuer (+ Soli)</td><td>− {eur(m(r.p1, 'withheld'))}</td><td>− {eur(m(r.p2, 'withheld'))}</td><td>− {eur(m(r.p1, 'withheld') + m(r.p2, 'withheld'))}</td></tr>
        <tr class="net"><td>Net in pocket</td><td>{eur(m(r.p1, 'netA'))}</td><td>{eur(m(r.p2, 'netA'))}</td><td>{eur(m(r.p1, 'netA') + m(r.p2, 'netA'))}</td></tr>
      </tbody>
    </table>
  </div>

  <!-- ============ RECONCILIATION ============ -->
  <div class="sec-title"><span class="n">4</span> Year-end reconciliation</div>
  <div class="card">
    <div class="recon">
      <div class="leg"><div class="lbl">Withheld over the year</div><div class="v">{eur(r.withheld)}</div></div>
      <div class="arrow">vs</div>
      <div class="leg"><div class="lbl">True annual liability</div><div class="v">{eur(r.annualTotal)}</div></div>
      <div class="balance {r.balance >= 0 ? 'refund' : 'owe'}">
        <div class="lbl">{r.balance >= 0 ? 'Expected refund' : 'Expected back-payment'}</div>
        <div class="v">{r.balance >= 0 ? '+ ' + eur(r.balance) : '− ' + eur(-r.balance)}</div>
      </div>
    </div>
    <p class="recon-note">{rNote}</p>
  </div>

  <!-- ============ CAPITAL INCOME ============ -->
  <div class="sec-title"><span class="n">5</span> Australian bank interest — capital income (taxed separately, flat 25%)</div>
  <div class="card">
    <div class="field" style="max-width:380px; margin-bottom:20px">
      <label>Australian bank interest received (gross, in €)</label>
      <div class="input"><span>€</span><input type="number" inputmode="numeric" min="0" step="500" bind:value={interest}></div>
    </div>
    <table>
      <tbody>
        <tr><td>Gross interest</td><td>{eur(r.cap.interest)}</td></tr>
        <tr><td>− Sparer-Pauschbetrag (married)</td><td>− {eur(Math.min(r.cap.interest, 2000))}</td></tr>
        <tr><td>= Taxable in Germany</td><td>{eur(r.cap.taxable)}</td></tr>
        <tr><td>Abgeltungsteuer (25%)</td><td>{eur(r.cap.abgGross)}</td></tr>
        <tr><td>− Australian tax credited (10%)</td><td>− {eur(r.cap.auCredit)}</td></tr>
        <tr><td>+ Soli (5.5%)</td><td>+ {eur(r.cap.soliInt)}</td></tr>
        <tr class="net"><td>German tax due on the interest</td><td>{eur(r.cap.germanDue)}</td></tr>
      </tbody>
    </table>
    {#if iNote}<p class="recon-note">{iNote}</p>{/if}
  </div>

  <!-- ============ FINE-TUNER ============ -->
  <div class="sec-title"><span class="n">6</span> Fine-tuner — nudge the levers you control</div>
  <div class="card">
    <div class="field">
      <label>Additional deductions (€/yr) — extra Werbungskosten, Sonderausgaben, deductible pension or freelance expenses</label>
      <div class="tuner-row">
        <input type="range" min="0" max="30000" step="250" bind:value={deductions}>
        <div class="input" style="width:160px"><span>€</span><input type="number" min="0" max="200000" step="250" bind:value={deductions}></div>
      </div>
    </div>
    <div class="field">
      <label>Denkmal renovation costs — total eligible, owner-occupied (§10f)</label>
      <div class="tuner-row">
        <div class="input" style="flex:1"><span>€</span><input type="number" inputmode="numeric" min="0" step="5000" bind:value={denkmalCost}></div>
        <div style="width:260px; color:var(--muted); font-size:13px">→ written off this year (9%): <b style="color:var(--accent2)">{eur(r.denkmalAfA)}</b><br><span style="font-size:11px">9%/yr for 10 years</span></div>
      </div>
    </div>
    <div class="stats" style="margin-top:6px">
      <div class="stat"><div class="k">Taxable income after deductions</div><div class="v">{eur(r.zvE)}</div></div>
      <div class="stat"><div class="k">Income tax saved</div><div class="v" style="color:var(--good)">{saved > 0 ? '− ' + eur(saved) : eur(0)}</div></div>
      <div class="stat"><div class="k">New total German tax</div><div class="v">{eur(r.grandTotal)}</div></div>
      <div class="stat"><div class="k">Year-end balance now</div><div class="v" style="color:{r.balance >= 0 ? 'var(--good)' : 'var(--bad)'}">{r.balance >= 0 ? '+ ' + eur(r.balance) : '− ' + eur(Math.abs(r.balance))}</div></div>
    </div>

    <div style="margin-top:24px">
      <div style="font-size:12px; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); font-weight:600; margin-bottom:12px">
        Tax-class comparison — same total tax, only the cash-flow timing differs
      </div>
      <table>
        <thead><tr><th>Combo</th><th>Combined net / month</th><th>Year-end balance</th></tr></thead>
        <tbody>
          {#each rows as row}
            {@const cur = row.a === classYou && row.b === classWife}
            <tr class:cur>
              <td>{row.a} + {row.b}{cur ? ' · current' : ''}</td>
              <td>{eur(row.net)}{#if row.net === bestNet}<span class="recommend"> ▲ most cash</span>{/if}</td>
              <td style="color:{row.bal >= 0 ? 'var(--good)' : 'var(--bad)'}">{row.bal >= 0 ? '+ ' + eur(row.bal) : '− ' + eur(Math.abs(row.bal))}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      <p class="recon-note">{comboNote}</p>
    </div>
  </div>

  <!-- ============ GRAND TOTAL ============ -->
  <div class="total" style="margin-top:18px">
    <div>
      <div class="lbl">Total German tax — salary + rent progression + interest</div>
      <div class="big">{eur(r.grandTotal)}</div>
    </div>
    <div class="rates">
      <div><div class="lbl">Annual bill</div><b style="color:var(--ink)">{eur(r.annualTotal)}</b></div>
      <div><div class="lbl">On interest</div><b style="color:var(--ink)">{eur(r.cap.germanDue)}</b></div>
    </div>
  </div>

  <p class="assumptions">
    <b>Approximate — for orientation only, not tax advice or a Lohnabrechnung.</b>
    Tax year {year}, married filing jointly, <b>statutory health insurance</b> (Zusatzbeitrag and
    number of children are your inputs above), <b>no church tax</b>. Children lower your
    Pflegeversicherung rate and your Soli base, but — as in the real withholding system — they
    do <b>not</b> reduce your Lohnsteuer or income tax (no Kindergeld/Kinderfreibetrag
    Günstigerprüfung is modelled). Lohnsteuer is estimated from the §32a tariff per class with a
    standard Vorsorgepauschale; expect it within a few percent of your real payslip. Taxable
    income is estimated from gross via social-security contributions plus the standard allowances.
    <b>Freelance income</b> (freiberuflich, §18) is added to your taxable income and taxed at your
    normal rate (no Gewerbesteuer); it has no withholding, so in reality you pre-pay it via
    quarterly Vorauszahlungen. The Australian rent is treated as exempt-but-progression-relevant
    (§32b EStG). Australian
    <b>bank interest</b> is taxed separately at the flat 25% Abgeltungsteuer + 5.5% Soli (no
    Freigrenze) after the €2,000 saver's allowance, with the 10% Australian treaty withholding
    credited — it does <b>not</b> affect your salary's tax rate, and excess foreign withholding
    isn't refundable. The fine-tuner's <b>additional deductions</b> simply lower your taxable
    income (enter the net deductible total — real deductions have their own caps); tax classes
    change only your monthly cash flow, never the total annual tax. The <b>Denkmal-AfA</b> (§10f,
    owner-occupied) writes off 9% of the entered renovation costs each year for 10 years as a
    Sonderausgabe; eligibility (listed-building status, the costs that qualify, the official
    Bescheinigung from the Denkmalbehörde) is assumed — confirm it with your Steuerberater.
  </p>
</div>

{#if consent === null}
  <div class="cookie-bar" role="dialog" aria-label="Cookie consent">
    <div class="cookie-text">
      <b>Keep your numbers?</b> This site can store your form entries in a single first-party cookie
      so you don't have to re-type them next time. <b>Functional only</b> — no tracking, no analytics,
      nothing leaves your browser.
    </div>
    <div class="cookie-actions">
      <button class="ghost" onclick={declineCookies}>Decline</button>
      <button class="primary" onclick={acceptCookies}>Accept</button>
    </div>
  </div>
{/if}

<style>
  :global(:root){
    --bg:#0a0b10; --panel:rgba(255,255,255,.045); --panel2:rgba(255,255,255,.02);
    --border:rgba(255,255,255,.09); --ink:#e7e9f0; --muted:#9aa0b4;
    --accent:#7c6bff; --accent2:#22d3ee; --good:#34d399; --warn:#fbbf24; --bad:#fb7185;
  }
  :global(*){box-sizing:border-box}
  :global(body){
    margin:0; min-height:100vh; color:var(--ink);
    background:
      radial-gradient(900px 520px at 10% -10%, rgba(124,107,255,.20), transparent 60%),
      radial-gradient(760px 460px at 100% 0%, rgba(34,211,238,.12), transparent 55%),
      var(--bg);
    font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif;
    -webkit-font-smoothing:antialiased; padding:44px 20px 80px;
  }
  .wrap{max-width:1000px; margin:0 auto}
  .tag{display:inline-flex; gap:8px; align-items:center; font-size:12px; letter-spacing:.08em;
    text-transform:uppercase; color:var(--accent2); border:1px solid var(--border);
    padding:6px 12px; border-radius:999px; background:var(--panel)}
  h1{font-size:32px; line-height:1.15; margin:16px 0 6px; letter-spacing:-.02em}
  .lede{color:var(--muted); font-size:17px; margin:0 0 28px; max-width:660px}
  .sec-title{font-size:13px; letter-spacing:.1em; text-transform:uppercase; color:var(--muted);
    font-weight:600; margin:34px 0 14px; display:flex; align-items:center; gap:10px}
  .sec-title:first-of-type{margin-top:0}
  .sec-title .n{display:inline-flex; width:22px; height:22px; border-radius:7px; background:var(--panel);
    border:1px solid var(--border); align-items:center; justify-content:center; color:var(--accent); font-size:12px}
  .grid{display:grid; gap:16px}
  .cols2{grid-template-columns:1fr 1fr}
  @media(max-width:780px){.cols2{grid-template-columns:1fr}}
  .row3{display:grid; grid-template-columns:1.6fr 1.6fr 1fr 1fr; gap:18px}
  .row3 .field{margin:0}
  @media(max-width:780px){.row3{grid-template-columns:1fr 1fr}}
  @media(max-width:520px){.row3{grid-template-columns:1fr}}
  .card{background:var(--panel); border:1px solid var(--border); border-radius:18px;
    padding:22px 24px; backdrop-filter:blur(8px)}
  .card h3{margin:0 0 16px; font-size:16px; display:flex; align-items:center; justify-content:space-between}
  label{display:block; font-size:13px; color:var(--muted); margin:0 0 7px}
  .field{margin:0 0 18px}
  .field:last-child{margin-bottom:0}
  .input{position:relative}
  .input span{position:absolute; left:14px; top:50%; transform:translateY(-50%); color:var(--muted); font-size:17px}
  input{width:100%; background:var(--panel2); border:1px solid var(--border); border-radius:12px;
    color:var(--ink); font-size:20px; font-variant-numeric:tabular-nums; padding:13px 14px 13px 32px;
    outline:none; transition:border-color .15s, box-shadow .15s}
  input:focus{border-color:var(--accent); box-shadow:0 0 0 3px rgba(124,107,255,.18)}
  input::-webkit-outer-spin-button,input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
  .classes{display:flex; gap:8px}
  .classes button{flex:1; background:var(--panel2); border:1px solid var(--border); color:var(--muted);
    border-radius:10px; padding:11px 0; font-size:15px; font-weight:600; cursor:pointer; transition:.12s}
  .classes button.on{background:rgba(124,107,255,.18); border-color:var(--accent); color:#fff}
  .year-field{max-width:220px}
  select{width:100%; background:var(--panel2); border:1px solid var(--border); border-radius:12px;
    color:var(--ink); font-size:20px; font-variant-numeric:tabular-nums; padding:13px 14px;
    outline:none; cursor:pointer; transition:border-color .15s, box-shadow .15s;
    appearance:none; -webkit-appearance:none;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%239aa0b4' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
    background-repeat:no-repeat; background-position:right 14px center}
  select:focus{border-color:var(--accent); box-shadow:0 0 0 3px rgba(124,107,255,.18)}
  select option{background:#11131b; color:var(--ink)}
  .warn-box{background:rgba(251,191,36,.10); border:1px solid rgba(251,191,36,.35); color:#fde68a;
    border-radius:12px; padding:12px 16px; font-size:14px; margin:0 0 16px}

  /* headline */
  .total{background:linear-gradient(135deg, rgba(124,107,255,.16), rgba(34,211,238,.07));
    border:1px solid rgba(124,107,255,.32); border-radius:20px; padding:24px 26px;
    display:flex; align-items:flex-end; justify-content:space-between; flex-wrap:wrap; gap:18px}
  .total .lbl{font-size:12px; letter-spacing:.08em; text-transform:uppercase; color:var(--muted)}
  .total .big{font-size:42px; font-weight:650; letter-spacing:-.02em; font-variant-numeric:tabular-nums; line-height:1}
  .total .rates{display:flex; gap:26px; text-align:right}
  .total .rates .lbl{margin-bottom:4px}
  .total .rates b{font-size:22px; font-weight:600; font-variant-numeric:tabular-nums; color:var(--accent2)}

  .stats{display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-top:16px}
  @media(max-width:780px){.stats{grid-template-columns:1fr 1fr}}
  .stat{background:var(--panel); border:1px solid var(--border); border-radius:16px; padding:16px 18px}
  .stat .k{font-size:12px; color:var(--muted); margin-bottom:10px; min-height:30px}
  .stat .v{font-size:22px; font-weight:600; font-variant-numeric:tabular-nums; letter-spacing:-.01em}
  .stat.cost .v{color:var(--warn)}

  /* monthly table */
  table{width:100%; border-collapse:collapse; font-size:15px}
  th,td{padding:12px 14px; text-align:right; border-bottom:1px solid var(--border); font-variant-numeric:tabular-nums}
  th{color:var(--muted); font-weight:600; font-size:12px; letter-spacing:.04em; text-transform:uppercase}
  td:first-child,th:first-child{text-align:left}
  tr.net td{font-weight:600; border-bottom:none}
  tr.net{background:var(--panel2)}
  .cls-pill{display:inline-block; font-size:11px; font-weight:700; color:var(--accent2);
    border:1px solid var(--border); border-radius:6px; padding:2px 7px; margin-left:8px}

  /* reconciliation */
  .recon{display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:18px}
  .recon .leg{flex:1; min-width:180px}
  .recon .leg .lbl{font-size:12px; color:var(--muted); text-transform:uppercase; letter-spacing:.06em; margin-bottom:6px}
  .recon .leg .v{font-size:26px; font-weight:600; font-variant-numeric:tabular-nums}
  .recon .arrow{color:var(--muted); font-size:24px}
  .balance{border-radius:16px; padding:18px 22px; text-align:right; min-width:220px}
  .balance.refund{background:rgba(52,211,153,.12); border:1px solid rgba(52,211,153,.4)}
  .balance.owe{background:rgba(251,113,133,.12); border:1px solid rgba(251,113,133,.4)}
  .balance .lbl{font-size:12px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); margin-bottom:6px}
  .balance .v{font-size:30px; font-weight:650; font-variant-numeric:tabular-nums}
  .balance.refund .v{color:var(--good)} .balance.owe .v{color:var(--bad)}
  .recon-note{color:var(--muted); font-size:13px; margin:14px 0 0; line-height:1.6}

  .tuner-row{display:flex; gap:16px; align-items:center}
  input[type=range]{flex:1; -webkit-appearance:none; appearance:none; height:6px; border-radius:999px;
    background:var(--panel2); border:1px solid var(--border); outline:none; padding:0}
  input[type=range]::-webkit-slider-thumb{-webkit-appearance:none; appearance:none; width:22px; height:22px;
    border-radius:50%; background:var(--accent); border:3px solid #0a0b10; cursor:pointer;
    box-shadow:0 0 0 1px var(--accent), 0 0 12px rgba(124,107,255,.6)}
  input[type=range]::-moz-range-thumb{width:18px; height:18px; border-radius:50%; background:var(--accent);
    border:3px solid #0a0b10; cursor:pointer}
  tr.cur td{background:rgba(124,107,255,.14)}
  tr.cur td:first-child{color:#fff; font-weight:600}
  .recommend{color:var(--good)}
  .assumptions{color:var(--muted); font-size:13px; line-height:1.65; border-top:1px solid var(--border);
    padding-top:18px; margin-top:30px}
  .assumptions b{color:var(--ink); font-weight:600}

  /* cookie consent */
  .cookie-bar{position:fixed; left:16px; right:16px; bottom:16px; margin:0 auto; max-width:760px;
    display:flex; align-items:center; gap:20px; flex-wrap:wrap; justify-content:space-between;
    background:rgba(16,18,27,.92); border:1px solid var(--border); border-radius:16px;
    padding:16px 20px; backdrop-filter:blur(12px); box-shadow:0 12px 40px rgba(0,0,0,.45); z-index:50}
  .cookie-text{flex:1; min-width:240px; font-size:13px; line-height:1.55; color:var(--muted)}
  .cookie-text b{color:var(--ink); font-weight:600}
  .cookie-actions{display:flex; gap:10px}
  .cookie-actions button{border-radius:10px; padding:10px 18px; font-size:14px; font-weight:600;
    cursor:pointer; border:1px solid var(--border); transition:.12s}
  .cookie-actions .ghost{background:transparent; color:var(--muted)}
  .cookie-actions .ghost:hover{color:var(--ink)}
  .cookie-actions .primary{background:var(--accent); border-color:var(--accent); color:#fff}
  .cookie-actions .primary:hover{filter:brightness(1.08)}
</style>
