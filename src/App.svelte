<script lang="ts">
  import {
    calculate,
    TAX_YEARS,
    type TaxClass,
    type TaxYear,
    type HouseholdInput,
    type PersonResult,
  } from './tax'
  import { getConsent, setConsent, saveForm, loadForm, clearForm, type Consent } from './storage'

  // If the user previously accepted, rehydrate the saved form; otherwise use dummy defaults.
  const savedForm = typeof document !== 'undefined' && getConsent() === 'accepted' ? loadForm() : null

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
    year,
    grossYou,
    classYou,
    grossWife,
    classWife,
    ausRent,
    zusatzPct,
    kids,
    interest,
    freelance,
    deductions,
    denkmalCost,
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
  // Isolate each lever's effect on the payable tax.
  const deductionsSaved = $derived(
    Math.max(0, calculate({ ...input, deductions: 0 }).annualTotal - r.annualTotal),
  )
  const noDenkmal = $derived(calculate({ ...input, denkmalCost: 0 }))
  const denkmalSaved = $derived(Math.max(0, noDenkmal.annualTotal - r.annualTotal))

  // Net income (take-home), with health + care insurance explicitly subtracted.
  const monthlyNet = $derived((r.p1.netA + r.p2.netA) / 12)
  const annualNet = $derived(r.p1.netA + r.p2.netA)
  const annualHealth = $derived(r.p1.kv + r.p1.pv + r.p2.kv + r.p2.pv)

  // A married couple can only run III+V (or V+III) or IV+IV.
  const comboValid = $derived(['III+V', 'IV+IV'].includes([classYou, classWife].slice().sort().join('+')))

  const eur = (n: number) =>
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(
      Math.round(n),
    )
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
</script>

<div class="shell">
  <header class="head">
    <span class="tag">◆ Tax year {year} · Married / jointly</span>
    <h1>German Tax Calculator</h1>
    <p class="lede">
      Every input lives on the left; the right side is purely what it computes. Two incomes, your tax classes,
      health insurance, and the Australian rent that lifts your German rate via <em>Progressionsvorbehalt</em> —
      from the annual tax you owe to the net income you actually take home.
    </p>
  </header>

  <div class="panes">
    <!-- ===================== RAIL · all inputs ===================== -->
    <aside class="rail">
      <section class="grp">
        <h2 class="grp-head">Household</h2>
        <div class="card">
          <div class="field">
            <label for="year">Tax year</label>
            <select id="year" bind:value={year}>
              {#each TAX_YEARS as y (y)}<option value={y}>{y}</option>{/each}
            </select>
          </div>
        </div>
        <div class="card">
          <div class="field">
            <label for="grossYou">You · gross annual salary</label>
            <div class="input">
              <span class="prefix">€</span>
              <input
                id="grossYou"
                type="number"
                inputmode="numeric"
                min="0"
                step="1000"
                bind:value={grossYou}
              />
            </div>
          </div>
          <div class="field">
            <label>Tax class (Steuerklasse)</label>
            <div class="pills">
              <button class:on={classYou === 'III'} onclick={() => (classYou = 'III')}>III</button><button
                class:on={classYou === 'IV'}
                onclick={() => (classYou = 'IV')}>IV</button
              ><button class:on={classYou === 'V'} onclick={() => (classYou = 'V')}>V</button>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="field">
            <label for="grossWife">Wife · gross annual salary</label>
            <div class="input">
              <span class="prefix">€</span>
              <input
                id="grossWife"
                type="number"
                inputmode="numeric"
                min="0"
                step="1000"
                bind:value={grossWife}
              />
            </div>
          </div>
          <div class="field">
            <label>Tax class (Steuerklasse)</label>
            <div class="pills">
              <button class:on={classWife === 'III'} onclick={() => (classWife = 'III')}>III</button><button
                class:on={classWife === 'IV'}
                onclick={() => (classWife = 'IV')}>IV</button
              ><button class:on={classWife === 'V'} onclick={() => (classWife = 'V')}>V</button>
            </div>
          </div>
        </div>
        {#if !comboValid}
          <div class="warn-box">
            ⚠ A married couple can only run III + V (or V + III) or IV + IV. The annual bill is still correct,
            but the monthly withholding for this combo isn't a real-world option.
          </div>
        {/if}
      </section>

      <section class="grp">
        <h2 class="grp-head">Health &amp; family</h2>
        <div class="card">
          <div class="field">
            <label>Health insurance</label>
            <div class="static">Statutory (gesetzlich)</div>
          </div>
          <div class="field two">
            <div>
              <label for="zusatz">Zusatzbeitrag</label>
              <div class="input">
                <input
                  id="zusatz"
                  type="number"
                  inputmode="decimal"
                  min="0"
                  max="5"
                  step="0.1"
                  bind:value={zusatzPct}
                />
                <span class="suffix">%</span>
              </div>
            </div>
            <div>
              <label for="kids">Children &lt; 25</label>
              <div class="input">
                <input
                  id="kids"
                  type="number"
                  inputmode="numeric"
                  min="0"
                  max="10"
                  step="1"
                  bind:value={kids}
                />
              </div>
            </div>
          </div>
          <p class="field-note">
            You both pay statutory <b>health insurance</b> (7.3% + half your Zusatzbeitrag) and
            <b>care insurance</b>, each capped at the {year} ceiling. Children lower the care-insurance rate. These
            feed directly into your net income.
          </p>
        </div>
      </section>

      <section class="grp">
        <h2 class="grp-head">Income</h2>
        <div class="card">
          <div class="field">
            <label for="ausRent">Australian rental income — exempt, progression-relevant</label>
            <div class="input">
              <span class="prefix">€</span>
              <input id="ausRent" type="number" inputmode="numeric" min="0" step="500" bind:value={ausRent} />
            </div>
          </div>
          <div class="field">
            <label for="freelance">Your freelance income (freiberuflich, taxable profit)</label>
            <div class="input">
              <span class="prefix">€</span>
              <input
                id="freelance"
                type="number"
                inputmode="numeric"
                min="0"
                step="1000"
                bind:value={freelance}
              />
            </div>
          </div>
          <div class="field">
            <label for="interest">Australian bank interest received (gross)</label>
            <div class="input">
              <span class="prefix">€</span>
              <input
                id="interest"
                type="number"
                inputmode="numeric"
                min="0"
                step="500"
                bind:value={interest}
              />
            </div>
          </div>
        </div>
      </section>

      <section class="grp">
        <h2 class="grp-head">Reliefs</h2>
        <div class="card">
          <div class="field two">
            <div>
              <label for="denkmal">Denkmal renovation cost</label>
              <div class="input">
                <span class="prefix">€</span>
                <input
                  id="denkmal"
                  type="number"
                  inputmode="numeric"
                  min="0"
                  step="5000"
                  bind:value={denkmalCost}
                />
              </div>
            </div>
            <div>
              <label>Written off (9% / yr)</label>
              <div class="static accent">{eur(r.denkmalAfA)}</div>
            </div>
          </div>
          <div class="field">
            <label for="deductions">Additional deductions (€ / yr)</label>
            <div class="tuner-row">
              <input
                type="range"
                min="0"
                max="30000"
                step="250"
                bind:value={deductions}
                aria-label="Additional deductions"
              />
              <div class="input">
                <span class="prefix">€</span>
                <input
                  id="deductions"
                  type="number"
                  min="0"
                  max="200000"
                  step="250"
                  bind:value={deductions}
                />
              </div>
            </div>
            <p class="field-note">
              Extra Werbungskosten, Sonderausgaben, deductible pension or freelance expenses — enter the net
              deductible total. Real deductions have their own caps.
            </p>
          </div>
        </div>
      </section>
    </aside>

    <!-- ===================== RESULTS ===================== -->
    <div class="results">
      <div class="hero">
        <div class="tile">
          <div class="lbl">Total German tax</div>
          <div class="big">{eur(r.grandTotal)}</div>
          <div class="sub">Income tax {eur(r.annualTotal)} · Interest {eur(r.cap.germanDue)}</div>
        </div>
        <div class="tile">
          <div class="lbl">Net income / month</div>
          <div class="big">{eur(monthlyNet)}</div>
          <div class="sub">{eur(annualNet)} / yr take-home</div>
        </div>
        <div class="tile {r.balance >= 0 ? 'refund' : 'owe'}">
          <div class="lbl">Year-end balance</div>
          <div class="big">{r.balance >= 0 ? '+ ' + eur(r.balance) : '− ' + eur(-r.balance)}</div>
          <div class="sub">{r.balance >= 0 ? 'expected refund' : 'expected back-payment'}</div>
        </div>
      </div>

      <div class="grid">
        <!-- ROW 1 · Australian rent · progression | Bank interest · capital -->
        <article class="card flush">
          <div class="card-title">
            <span class="badge">⌖</span>
            <h3>Australian rent · progression</h3>
            <span class="meta">§32b · exempt, rate-relevant</span>
          </div>
          <div class="card-body">
            <div class="statrow c3">
              <div class="stat">
                <div class="k">Tax without the rent</div>
                <div class="v">{eur(r.taxNoRent)}</div>
              </div>
              <div class="stat">
                <div class="k">Cost of the rent (progression)</div>
                <div class="v warn">+ {eur(r.costOfRent)}</div>
              </div>
              <div class="stat">
                <div class="k">Special rate (bes. Steuersatz)</div>
                <div class="v">{pct(r.specialRate)}</div>
              </div>
            </div>
            <p class="note">
              The {eur(ausRent)} rent is tax-exempt in Germany but lifts the rate applied to your salary (Progressionsvorbehalt)
              — adding {eur(r.costOfRent)} to your bill.
            </p>
          </div>
        </article>

        <article class="card flush">
          <div class="card-title">
            <span class="badge">%</span>
            <h3>Bank interest · capital</h3>
            <span class="meta">flat 25% Abgeltungsteuer</span>
          </div>
          <div class="card-body pad-top">
            <div class="table-scroll">
              <table>
                <tbody>
                  <tr><td>Gross interest</td><td>{eur(r.cap.interest)}</td></tr>
                  <tr
                    ><td>− Sparer-Pauschbetrag (married)</td><td>− {eur(Math.min(r.cap.interest, 2000))}</td
                    ></tr
                  >
                  <tr><td>= Taxable in Germany</td><td>{eur(r.cap.taxable)}</td></tr>
                  <tr><td>Abgeltungsteuer (25%)</td><td>{eur(r.cap.abgGross)}</td></tr>
                  <tr><td>− Australian tax credited (10%)</td><td>− {eur(r.cap.auCredit)}</td></tr>
                  <tr><td>+ Soli (5.5%)</td><td>+ {eur(r.cap.soliInt)}</td></tr>
                  <tr class="net"><td>German tax due on the interest</td><td>{eur(r.cap.germanDue)}</td></tr>
                </tbody>
              </table>
            </div>
            {#if iNote}<p class="note">{iNote}</p>{/if}
          </div>
        </article>

        <!-- ROW 2 · Deductions impact | Denkmal-AfA impact -->
        <article class="card flush">
          <div class="card-title">
            <span class="badge">↓</span>
            <h3>Deductions impact</h3>
          </div>
          <div class="card-body">
            <div class="statrow c2">
              <div class="stat">
                <div class="k">Taxable income after deductions</div>
                <div class="v">{eur(r.zvE)}</div>
              </div>
              <div class="stat">
                <div class="k">Income tax saved (deductions)</div>
                <div class="v good">{deductionsSaved > 0 ? '− ' + eur(deductionsSaved) : eur(0)}</div>
              </div>
              <div class="stat">
                <div class="k">New total German tax</div>
                <div class="v">{eur(r.grandTotal)}</div>
              </div>
              <div class="stat">
                <div class="k">Year-end balance now</div>
                <div class="v {r.balance >= 0 ? 'good' : 'bad'}">
                  {r.balance >= 0 ? '+ ' + eur(r.balance) : '− ' + eur(Math.abs(r.balance))}
                </div>
              </div>
            </div>
            <p class="callout">Drag the deductions slider on the left to see this update.</p>
          </div>
        </article>

        <article class="card flush">
          <div class="card-title">
            <span class="badge">⌂</span>
            <h3>Denkmal-AfA impact</h3>
            <span class="meta">§10f · 9% / yr</span>
          </div>
          <div class="card-body">
            <div class="statrow c3">
              <div class="stat">
                <div class="k">Tax payable without Denkmal</div>
                <div class="v">{eur(noDenkmal.annualTotal)}</div>
              </div>
              <div class="stat">
                <div class="k">Tax payable with Denkmal</div>
                <div class="v">{eur(r.annualTotal)}</div>
              </div>
              <div class="stat">
                <div class="k">Income tax saved this year</div>
                <div class="v good">{denkmalSaved > 0 ? '− ' + eur(denkmalSaved) : eur(0)}</div>
              </div>
            </div>
            {#if r.denkmalAfA > 0}
              <p class="note">
                The {eur(r.denkmalAfA)} write-off cuts this year's payable income tax (incl. Soli) from {eur(
                  noDenkmal.annualTotal,
                )} to {eur(r.annualTotal)} — a saving of {eur(denkmalSaved)}, repeatable for 10 years.
              </p>
            {:else}
              <p class="callout">Enter renovation cost on the left to model the 10-year write-off.</p>
            {/if}
          </div>
        </article>

        <!-- ROW 3 · Annual income tax | Year-end reconciliation -->
        <article class="card flush">
          <div class="card-title">
            <span class="badge">▦</span>
            <h3>Annual income tax</h3>
            <span class="meta">tax classes don't change this</span>
          </div>
          <div class="card-body">
            <div class="big">{eur(r.annualTotal)}</div>
            <div class="caption">
              Income tax <b>{eur(r.incomeTax)}</b> · Soli <b>{eur(r.annualSoli)}</b>
            </div>
            <div class="statrow c3">
              <div class="stat">
                <div class="k">Effective rate</div>
                <div class="v accent">{pct(r.effective)}</div>
              </div>
              <div class="stat">
                <div class="k">Marginal rate</div>
                <div class="v accent">{pct(r.marginal)}</div>
              </div>
              <div class="stat">
                <div class="k">Taxable income (est. zvE)</div>
                <div class="v">{eur(r.zvE)}</div>
              </div>
            </div>
          </div>
        </article>

        <article class="card flush">
          <div class="card-title">
            <span class="badge">⇄</span>
            <h3>Year-end reconciliation</h3>
          </div>
          <div class="card-body">
            <div class="statrow c2">
              <div class="stat">
                <div class="k">Withheld over the year</div>
                <div class="v">{eur(r.withheld)}</div>
              </div>
              <div class="stat">
                <div class="k">True annual liability</div>
                <div class="v">{eur(r.annualTotal)}</div>
              </div>
            </div>
            <div class="balance {r.balance >= 0 ? 'refund' : 'owe'}">
              <div class="k">{r.balance >= 0 ? 'Expected refund' : 'Expected back-payment'}</div>
              <div class="v">{r.balance >= 0 ? '+ ' + eur(r.balance) : '− ' + eur(-r.balance)}</div>
            </div>
            <p class="note">{rNote}</p>
          </div>
        </article>

        <!-- ROW 4 · Monthly take-home (full width) -->
        <article class="card flush span2">
          <div class="card-title">
            <span class="badge">€</span>
            <h3>Monthly take-home</h3>
            <span class="meta">net income breakdown</span>
          </div>
          <div class="card-body pad-top">
            <div class="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Per month</th>
                    <th>You <span class="cls-pill">{classYou}</span></th>
                    <th>Wife <span class="cls-pill">{classWife}</span></th>
                    <th>Together</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    ><td>Gross</td><td>{eur(m(r.p1, 'g'))}</td><td>{eur(m(r.p2, 'g'))}</td><td
                      >{eur(m(r.p1, 'g') + m(r.p2, 'g'))}</td
                    ></tr
                  >
                  <tr
                    ><td>− Pension &amp; unemployment</td><td>− {eur(m(r.p1, 'rvAlv'))}</td><td
                      >− {eur(m(r.p2, 'rvAlv'))}</td
                    ><td>− {eur(m(r.p1, 'rvAlv') + m(r.p2, 'rvAlv'))}</td></tr
                  >
                  <tr
                    ><td>− Health insurance (KV)</td><td>− {eur(m(r.p1, 'kv'))}</td><td
                      >− {eur(m(r.p2, 'kv'))}</td
                    ><td>− {eur(m(r.p1, 'kv') + m(r.p2, 'kv'))}</td></tr
                  >
                  <tr
                    ><td>− Care insurance (PV)</td><td>− {eur(m(r.p1, 'pv'))}</td><td
                      >− {eur(m(r.p2, 'pv'))}</td
                    ><td>− {eur(m(r.p1, 'pv') + m(r.p2, 'pv'))}</td></tr
                  >
                  <tr
                    ><td>− Income tax (+ Soli)</td><td>− {eur(m(r.p1, 'withheld'))}</td><td
                      >− {eur(m(r.p2, 'withheld'))}</td
                    ><td>− {eur(m(r.p1, 'withheld') + m(r.p2, 'withheld'))}</td></tr
                  >
                  <tr class="net"
                    ><td>Net in pocket</td><td>{eur(m(r.p1, 'netA'))}</td><td>{eur(m(r.p2, 'netA'))}</td><td
                      >{eur(m(r.p1, 'netA') + m(r.p2, 'netA'))}</td
                    ></tr
                  >
                </tbody>
              </table>
            </div>
            <div class="statrow c2 pad-top">
              <div class="stat">
                <div class="k">Net income / year (take-home)</div>
                <div class="v">{eur(annualNet)}</div>
              </div>
              <div class="stat">
                <div class="k">Health + care insurance / year</div>
                <div class="v">{eur(annualHealth)}</div>
              </div>
            </div>
          </div>
        </article>
      </div>
    </div>
  </div>

  <p class="assumptions">
    <b>Approximate — for orientation only, not tax advice or a Lohnabrechnung.</b>
    Tax year {year}, married filing jointly, <b>statutory health insurance</b> (Zusatzbeitrag and number of
    children are your inputs), <b>no church tax</b>. Children lower your Pflegeversicherung rate and your Soli
    base, but — as in the real withholding system — they do <b>not</b> reduce your Lohnsteuer or income tax
    (no Kindergeld/Kinderfreibetrag Günstigerprüfung is modelled). Lohnsteuer is estimated from the §32a
    tariff per class with a standard Vorsorgepauschale; expect it within a few percent of your real payslip.
    Taxable income is estimated from gross via social-security contributions plus the standard allowances.
    <b>Freelance income</b> (freiberuflich, §18) is added to your taxable income and taxed at your normal rate
    (no Gewerbesteuer); it has no withholding, so in reality you pre-pay it via quarterly Vorauszahlungen. The
    Australian rent is treated as exempt-but-progression-relevant (§32b EStG). Australian
    <b>bank interest</b> is taxed separately at the flat 25% Abgeltungsteuer + 5.5% Soli (no Freigrenze) after
    the €2,000 saver's allowance, with the 10% Australian treaty withholding credited — it does <b>not</b>
    affect your salary's tax rate, and excess foreign withholding isn't refundable. The
    <b>additional deductions</b> simply lower your taxable income; tax classes change only your monthly cash
    flow, never the total annual tax. The <b>Denkmal-AfA</b> (§10f, owner-occupied) writes off 9% of the entered
    renovation costs each year for 10 years as a Sonderausgabe; eligibility (listed-building status, qualifying
    costs, the official Bescheinigung) is assumed — confirm it with your Steuerberater.
  </p>
</div>

{#if consent === null}
  <div class="cookie-bar" role="dialog" aria-label="Cookie consent">
    <div class="cookie-text">
      <b>Keep your numbers?</b> This site can store your form entries in a single first-party cookie so you
      don't have to re-type them next time. <b>Functional only</b> — no tracking, no analytics, nothing leaves your
      browser.
    </div>
    <div class="cookie-actions">
      <button class="ghost" onclick={declineCookies}>Decline</button>
      <button class="primary" onclick={acceptCookies}>Accept</button>
    </div>
  </div>
{/if}

<style>
  /* ============================================================
     DESIGN TOKENS — the single place to restyle the whole app.
     Change a value here and it propagates to every card, label,
     heading, number and accent below.
     ============================================================ */
  :global(:root) {
    /* palette */
    --bg: #131416;
    --panel: #1d1f22;
    --panel2: #26282d;
    --line: rgba(255, 255, 255, 0.09);
    --ink: #ecedef;
    --muted: #969aa1;
    --paper: #1a1205;
    --accent: #ff6b2c;
    --accent2: #ffa24d;
    --good: #36c28b;
    --warn: #e0a23a;
    --bad: #f0685c;
    --accent-grad: linear-gradient(140deg, #ff7c3d, #f2521a);

    --font-body: 'Hanken Grotesk Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

    /* radii */
    --r-card: 16px;
    --r-input: 11px;
    --r-pill: 10px;

    /* spacing rhythm */
    --rail-gap: 22px; /* between input groups */
    --card-gap: 12px; /* between cards within a group */
    --grid-gap: 16px; /* between result cards */
    --pad-card: 16px 18px;
    --pad-title: 13px 18px;

    /* TYPE ROLES — reusable heading / label / number recipes.
       e.g. restyle every card heading by editing --card-title-*. */
    --grp-head-size: 12px;
    --grp-head-spacing: 0.16em;
    --grp-head-weight: 800;
    --grp-head-color: var(--accent);

    --card-title-size: 15px;
    --card-title-weight: 800;
    --card-title-color: var(--ink);

    --label-size: 13px;
    --label-color: var(--muted);
    --label-weight: 500;

    --tile-lbl-size: 11px;
    --tile-lbl-spacing: 0.1em;
    --tile-lbl-color: var(--muted);

    --stat-k-size: 11px;
    --stat-v-size: 20px;

    --big-size: clamp(30px, 4vw, 40px);
    --big-weight: 800;
  }

  :global(*) {
    box-sizing: border-box;
  }
  :global(body) {
    margin: 0;
    min-height: 100vh;
    color: var(--ink);
    background-color: var(--bg);
    background-image:
      radial-gradient(820px 460px at 88% -6%, rgba(255, 107, 44, 0.13), transparent 62%),
      radial-gradient(680px 420px at 0% 100%, rgba(255, 107, 44, 0.05), transparent 60%),
      linear-gradient(180deg, #17181b, #121315);
    background-attachment: fixed;
    font-family: var(--font-body);
    font-size: 16px;
    line-height: 1.55;
    -webkit-font-smoothing: antialiased;
    padding: 52px 20px 96px;
    font-variant-numeric: tabular-nums;
  }
  .shell {
    max-width: 1660px;
    margin: 0 auto;
  }
  .shell > * {
    animation: rise 0.5s cubic-bezier(0.2, 0.7, 0.2, 1) both;
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .shell > * {
      animation: none;
    }
  }

  /* ---- header ---- */
  .tag {
    display: inline-flex;
    gap: 8px;
    align-items: center;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--accent);
    border: 1px solid var(--line);
    padding: 7px 14px;
    border-radius: 999px;
    background: rgba(255, 107, 44, 0.07);
  }
  h1 {
    font-weight: 800;
    font-size: clamp(34px, 6vw, 58px);
    line-height: 1.02;
    letter-spacing: -0.03em;
    margin: 22px 0 10px;
  }
  .lede {
    color: var(--muted);
    font-size: 18px;
    margin: 0;
    max-width: 660px;
    line-height: 1.5;
  }

  /* ---- two-pane shell ---- */
  .panes {
    margin-top: 26px;
  }
  .rail {
    display: flex;
    flex-direction: column;
    gap: var(--rail-gap);
  }
  .results {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--grid-gap);
    margin-top: var(--rail-gap);
  }

  /* ---- reusable: rail group + its header ---- */
  .grp {
    display: flex;
    flex-direction: column;
    gap: var(--card-gap);
  }
  .grp-head {
    font-size: var(--grp-head-size);
    letter-spacing: var(--grp-head-spacing);
    text-transform: uppercase;
    font-weight: var(--grp-head-weight);
    color: var(--grp-head-color);
    margin: 0 0 2px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .grp-head::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--line);
  }

  /* ---- reusable: card ---- */
  .card {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--r-card);
    padding: var(--pad-card);
  }
  .card.flush {
    padding: 0;
    overflow: hidden;
  }

  /* ---- reusable: card title (lives INSIDE the card) ---- */
  .card-title {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: var(--pad-title);
    border-bottom: 1px solid var(--line);
  }
  .card-title .badge {
    width: 22px;
    height: 22px;
    border-radius: 7px;
    background: var(--accent-grad);
    color: var(--paper);
    font-size: 12px;
    font-weight: 800;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
  }
  .card-title h3 {
    margin: 0;
    font-size: var(--card-title-size);
    font-weight: var(--card-title-weight);
    color: var(--card-title-color);
    letter-spacing: -0.01em;
  }
  .card-title .meta {
    margin-left: auto;
    font-size: 11px;
    color: var(--muted);
    text-align: right;
  }
  .card-body {
    padding: 18px;
  }
  .card-body.pad-top {
    padding-top: 8px;
  }

  /* ---- reusable: field / label / input ---- */
  label {
    display: block;
    font-size: var(--label-size);
    color: var(--label-color);
    font-weight: var(--label-weight);
    margin: 0 0 8px;
  }
  .field + .field {
    margin-top: 16px;
  }
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }
  .two label {
    min-height: 32px;
  }

  .input {
    position: relative;
  }
  .input .prefix,
  .input .suffix {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    color: var(--muted);
    font-size: 16px;
    font-weight: 600;
  }
  .input .prefix {
    left: 14px;
  }
  .input .suffix {
    right: 14px;
  }
  input {
    width: 100%;
    background: var(--panel2);
    border: 1px solid var(--line);
    border-radius: var(--r-input);
    color: var(--ink);
    font-family: var(--font-body);
    font-size: 20px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    padding: 13px 14px;
    outline: none;
    transition:
      box-shadow 0.12s,
      border-color 0.12s;
  }
  .input:has(.prefix) input {
    padding-left: 32px;
  }
  .input:has(.suffix) input {
    padding-right: 32px;
  }
  input:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(255, 107, 44, 0.18);
  }
  input::-webkit-outer-spin-button,
  input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .static {
    background: var(--panel2);
    border: 1px solid var(--line);
    border-radius: var(--r-input);
    color: var(--muted);
    font-size: 17px;
    font-weight: 700;
    padding: 14px;
  }
  .static.accent {
    color: var(--accent2);
  }
  .field-note {
    color: var(--muted);
    font-size: 12.5px;
    line-height: 1.55;
    margin: 14px 0 0;
  }
  .field-note b {
    color: var(--ink);
    font-weight: 700;
  }

  select {
    width: 100%;
    background: var(--panel2);
    border: 1px solid var(--line);
    border-radius: var(--r-input);
    color: var(--ink);
    font-family: var(--font-body);
    font-size: 20px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    padding: 13px 14px;
    outline: none;
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23FF6B2C' stroke-width='2.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 14px center;
  }
  select:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(255, 107, 44, 0.18);
  }
  select option {
    background: #1e2023;
    color: var(--ink);
  }

  /* ---- reusable: tax-class pills ---- */
  .pills {
    display: flex;
    gap: 8px;
  }
  .pills button {
    flex: 1;
    background: var(--panel2);
    border: 1px solid var(--line);
    color: var(--ink);
    border-radius: var(--r-pill);
    padding: 11px 0;
    font-family: var(--font-body);
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
    transition: 0.12s;
  }
  .pills button.on {
    background: var(--accent-grad);
    border-color: transparent;
    color: var(--paper);
  }

  .warn-box {
    background: rgba(224, 162, 58, 0.12);
    border: 1px solid rgba(224, 162, 58, 0.4);
    color: #f0cb86;
    border-radius: 12px;
    padding: 13px 16px;
    font-size: 14px;
    font-weight: 500;
  }

  /* ---- reusable: slider ---- */
  .tuner-row {
    display: flex;
    gap: 16px;
    align-items: center;
  }
  .tuner-row .input {
    width: 150px;
    flex: none;
  }
  input[type='range'] {
    flex: 1;
    width: auto;
    -webkit-appearance: none;
    appearance: none;
    height: 8px;
    border-radius: 999px;
    background: #34373d;
    border: 1px solid var(--line);
    outline: none;
    padding: 0;
  }
  input[type='range']::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--accent-grad);
    border: none;
    cursor: pointer;
  }
  input[type='range']::-moz-range-thumb {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--accent-grad);
    border: none;
    cursor: pointer;
  }
  input[type='range']:focus {
    box-shadow: 0 0 0 3px rgba(255, 107, 44, 0.18);
  }

  /* ---- reusable: hero tiles ---- */
  .hero {
    display: grid;
    gap: var(--grid-gap);
    grid-template-columns: 1fr;
  }
  .tile {
    background: linear-gradient(180deg, #23262b, #1c1e22);
    border: 1px solid var(--line);
    border-radius: 18px;
    padding: 22px 24px;
  }
  .tile .lbl {
    font-size: var(--tile-lbl-size);
    letter-spacing: var(--tile-lbl-spacing);
    text-transform: uppercase;
    color: var(--tile-lbl-color);
    font-weight: 700;
  }
  .tile .big {
    font-size: clamp(34px, 4.4vw, 46px);
    font-weight: var(--big-weight);
    letter-spacing: -0.03em;
    line-height: 1.02;
    margin-top: 6px;
  }
  .tile .sub {
    font-size: 13px;
    color: var(--muted);
    margin-top: 8px;
  }
  .tile.refund {
    background: linear-gradient(135deg, #1e3a30, #172a23);
    border-color: rgba(54, 194, 139, 0.4);
  }
  .tile.refund .big {
    color: var(--good);
  }
  .tile.owe {
    background: linear-gradient(135deg, #3a2420, #2a1a18);
    border-color: rgba(240, 104, 92, 0.4);
  }
  .tile.owe .big {
    color: var(--bad);
  }

  /* ---- reusable: results grid + big number + caption ---- */
  .grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--grid-gap);
    align-items: start;
  }
  .big {
    font-size: var(--big-size);
    font-weight: var(--big-weight);
    letter-spacing: -0.03em;
    line-height: 1;
  }
  .caption {
    font-size: 13px;
    color: var(--muted);
    margin-top: 8px;
  }
  .caption b {
    color: var(--ink);
    font-weight: 700;
  }

  /* ---- reusable: stat tiles ---- */
  .statrow {
    display: grid;
    gap: 10px;
    margin-top: 16px;
  }
  .statrow.c2 {
    grid-template-columns: 1fr 1fr;
  }
  .statrow.c3 {
    grid-template-columns: 1fr 1fr 1fr;
  }
  .stat {
    background: var(--panel2);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 13px 14px;
  }
  .stat .k {
    font-size: var(--stat-k-size);
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    min-height: 28px;
    line-height: 1.3;
  }
  .stat .v {
    font-size: var(--stat-v-size);
    font-weight: 800;
    letter-spacing: -0.02em;
    margin-top: 6px;
  }
  .stat .v.accent {
    color: var(--accent);
  }
  .stat .v.good {
    color: var(--good);
  }
  .stat .v.warn {
    color: var(--warn);
  }
  .stat .v.bad {
    color: var(--bad);
  }

  /* ---- reusable: tables ---- */
  .table-scroll {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 15px;
  }
  th,
  td {
    padding: 12px 12px;
    text-align: right;
    border-bottom: 1px solid var(--line);
    white-space: nowrap;
  }
  th {
    color: var(--muted);
    font-weight: 700;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  td:first-child,
  th:first-child {
    text-align: left;
    color: var(--muted);
  }
  td {
    color: var(--ink);
    font-weight: 500;
  }
  tr.net td {
    font-weight: 800;
    border-bottom: none;
    background: rgba(255, 107, 44, 0.12);
    color: var(--ink);
  }
  .cls-pill {
    display: inline-block;
    font-size: 11px;
    font-weight: 700;
    color: var(--accent2);
    border: 1px solid rgba(255, 162, 77, 0.5);
    border-radius: 6px;
    padding: 1px 7px;
    margin-left: 6px;
  }

  /* ---- reusable: balance block + notes ---- */
  .balance {
    border-radius: 12px;
    padding: 14px 16px;
    border: 1px solid var(--line);
    margin-top: 12px;
  }
  .balance.refund {
    background: rgba(54, 194, 139, 0.12);
    border-color: rgba(54, 194, 139, 0.4);
  }
  .balance.owe {
    background: rgba(240, 104, 92, 0.12);
    border-color: rgba(240, 104, 92, 0.4);
  }
  .balance .k {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    font-weight: 700;
  }
  .balance .v {
    font-size: 26px;
    font-weight: 800;
    letter-spacing: -0.02em;
    margin-top: 5px;
  }
  .balance.refund .v {
    color: var(--good);
  }
  .balance.owe .v {
    color: var(--bad);
  }
  .note {
    color: var(--muted);
    font-size: 13px;
    margin: 14px 0 0;
    line-height: 1.6;
  }
  .callout {
    margin: 14px 0 0;
    background: rgba(255, 255, 255, 0.02);
    border: 1px dashed var(--line);
    border-radius: 10px;
    padding: 10px 13px;
    font-size: 12.5px;
    color: var(--accent2);
  }

  .assumptions {
    color: var(--muted);
    font-size: 13px;
    line-height: 1.7;
    border-top: 1px solid var(--line);
    padding-top: 20px;
    margin-top: 40px;
  }
  .assumptions b {
    color: var(--ink);
    font-weight: 700;
  }

  /* ---- cookie consent ---- */
  .cookie-bar {
    position: fixed;
    left: 16px;
    right: 16px;
    bottom: 16px;
    margin: 0 auto;
    max-width: 720px;
    display: flex;
    align-items: center;
    gap: 20px;
    flex-wrap: wrap;
    justify-content: space-between;
    background: #1f2226;
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 16px 20px;
    z-index: 50;
  }
  .cookie-text {
    flex: 1;
    min-width: 240px;
    font-size: 13px;
    line-height: 1.55;
    color: var(--muted);
  }
  .cookie-text b {
    color: var(--ink);
    font-weight: 700;
  }
  .cookie-actions {
    display: flex;
    gap: 10px;
  }
  .cookie-actions button {
    border-radius: 10px;
    padding: 11px 20px;
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    border: 1px solid var(--line);
    transition: 0.12s;
  }
  .cookie-actions .ghost {
    background: transparent;
    color: var(--muted);
  }
  .cookie-actions .ghost:hover {
    color: var(--ink);
  }
  .cookie-actions .primary {
    background: var(--accent-grad);
    border-color: transparent;
    color: var(--paper);
  }

  /* ===================== wide screens: two-pane ===================== */
  @media (min-width: 960px) {
    .panes {
      display: grid;
      grid-template-columns: 440px 1fr;
      gap: 32px;
      align-items: start;
    }
    .rail {
      position: sticky;
      top: 24px;
      align-self: start;
    }
    .results {
      margin-top: 0;
    }
    .hero {
      grid-template-columns: 1fr 1fr 1fr;
    }
    .grid {
      grid-template-columns: 1fr 1fr;
    }
    .grid .span2 {
      grid-column: 1 / -1;
    }
  }
  @media (min-width: 960px) and (max-width: 1180px) {
    .panes {
      grid-template-columns: 380px 1fr;
    }
  }

  /* ===================== phones ===================== */
  @media (max-width: 560px) {
    :global(body) {
      padding: 30px 14px 110px;
    }
    .lede {
      font-size: 16px;
    }
    .card-body {
      padding: 16px;
    }
    .statrow.c3 {
      grid-template-columns: 1fr 1fr;
    }
    th,
    td {
      padding: 10px 11px;
      font-size: 13px;
    }
    .tuner-row {
      flex-direction: column;
      align-items: stretch;
    }
    .tuner-row .input {
      width: 100%;
    }
    input[type='range'] {
      width: 100%;
    }
    .cookie-bar {
      left: 8px;
      right: 8px;
      bottom: 8px;
      padding: 14px 16px;
    }
    .cookie-actions {
      width: 100%;
    }
    .cookie-actions button {
      flex: 1;
    }
  }
</style>
