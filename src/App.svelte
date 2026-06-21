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

  // tax-class comparison: same total tax, differing monthly net / year-end balance
  const combos: [TaxClass, TaxClass][] = [
    ['III', 'V'],
    ['V', 'III'],
    ['IV', 'IV'],
  ]
  const rows = $derived(
    combos.map(([a, b]) => {
      const rr = calculate({ ...input, classYou: a, classWife: b })
      return { a, b, net: (rr.p1.netA + rr.p2.netA) / 12, bal: rr.balance }
    }),
  )
  const bestNet = $derived(Math.max(...rows.map((x) => x.net)))
  const richest = $derived(rows.reduce((mx, x) => (x.net > mx.net ? x : mx)))
  const closest = $derived(rows.reduce((mn, x) => (Math.abs(x.bal) < Math.abs(mn.bal) ? x : mn)))
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
  const comboNote = $derived(
    `Same total annual tax whichever you pick — only the timing moves. ${richest.a}+${richest.b} puts the most in your pocket monthly (${eur(richest.net)}), while ${closest.a}+${closest.b} lands closest to an even year-end settlement.`,
  )
</script>

<div class="wrap">
  <span class="tag">◆ Tax year {year} · Married / jointly</span>
  <h1>German Tax Calculator</h1>
  <p class="lede">
    Two incomes, your tax classes, health insurance, and the Australian rent that lifts your German rate via <em
      >Progressionsvorbehalt</em
    > — from the annual tax you owe to the net income you actually take home.
  </p>

  <div class="panes">
    <div class="rail">
      <!-- ============ INPUTS · household ============ -->
      <div class="sec-title"><span class="n">1</span> Your household</div>
      <div class="grid" style="margin-bottom:16px">
        <div class="card">
          <div class="field year-field">
            <label for="year">Tax year</label>
            <select id="year" bind:value={year}>
              {#each TAX_YEARS as y (y)}<option value={y}>{y}</option>{/each}
            </select>
          </div>
        </div>
      </div>
      {#if !comboValid}
        <div class="warn-box">
          ⚠ A married couple can only run III + V (or V + III) or IV + IV. The annual bill is still correct,
          but the monthly withholding for this combo isn't a real-world option.
        </div>
      {/if}
      <div class="grid cols2">
        <div class="card">
          <h3>You</h3>
          <div class="field">
            <label>Gross annual salary</label>
            <div class="input">
              <span>€</span><input
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
            <div class="classes">
              <button class:on={classYou === 'III'} onclick={() => (classYou = 'III')}>III</button><button
                class:on={classYou === 'IV'}
                onclick={() => (classYou = 'IV')}>IV</button
              ><button class:on={classYou === 'V'} onclick={() => (classYou = 'V')}>V</button>
            </div>
          </div>
        </div>
        <div class="card">
          <h3>Your wife</h3>
          <div class="field">
            <label>Gross annual salary</label>
            <div class="input">
              <span>€</span><input
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
            <div class="classes">
              <button class:on={classWife === 'III'} onclick={() => (classWife = 'III')}>III</button><button
                class:on={classWife === 'IV'}
                onclick={() => (classWife = 'IV')}>IV</button
              ><button class:on={classWife === 'V'} onclick={() => (classWife = 'V')}>V</button>
            </div>
          </div>
        </div>
      </div>

      <!-- ============ INPUTS · health & family ============ -->
      <div class="sec-title"><span class="n">2</span> Health insurance &amp; family</div>
      <div class="grid">
        <div class="card">
          <div class="row3">
            <div class="field">
              <label>Health insurance</label>
              <div class="static-field">Statutory (gesetzlich)</div>
            </div>
            <div class="field">
              <label>Krankenkasse Zusatzbeitrag</label>
              <div class="input">
                <span style="left:auto;right:14px">%</span><input
                  type="number"
                  inputmode="decimal"
                  min="0"
                  max="5"
                  step="0.1"
                  bind:value={zusatzPct}
                  style="padding-left:14px"
                />
              </div>
            </div>
            <div class="field">
              <label>Children (under 25)</label>
              <div class="input">
                <input
                  type="number"
                  inputmode="numeric"
                  min="0"
                  max="10"
                  step="1"
                  bind:value={kids}
                  style="padding-left:14px"
                />
              </div>
            </div>
          </div>
          <p class="field-note">
            You both pay statutory <b>health insurance</b> (7.3% + half your Zusatzbeitrag) and
            <b>care insurance</b>, each capped at the {year} contribution ceiling. Children lower the care-insurance
            rate. These feed directly into your net income below.
          </p>
        </div>
      </div>

      <!-- ============ INPUTS · other income ============ -->
      <div class="sec-title"><span class="n">3</span> Other income</div>
      <div class="grid">
        <div class="card">
          <div class="row2">
            <div class="field">
              <label>Australian net rental income (€) — exempt, progression-relevant</label>
              <div class="input">
                <span>€</span><input
                  type="number"
                  inputmode="numeric"
                  min="0"
                  step="500"
                  bind:value={ausRent}
                />
              </div>
            </div>
            <div class="field">
              <label>Your freelance income (freiberuflich, taxable profit €)</label>
              <div class="input">
                <span>€</span><input
                  type="number"
                  inputmode="numeric"
                  min="0"
                  step="1000"
                  bind:value={freelance}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <!-- /.rail -->

    <div class="results">
      <div class="hero">
        <div class="hero-tile">
          <div class="lbl">Total German tax</div>
          <div class="big">{eur(r.grandTotal)}</div>
          <div class="sub">Income tax {eur(r.annualTotal)} · Interest {eur(r.cap.germanDue)}</div>
        </div>
        <div class="hero-tile">
          <div class="lbl">Net income / month</div>
          <div class="big">{eur(monthlyNet)}</div>
          <div class="sub">{eur(annualNet)} / yr take-home</div>
        </div>
        <div class="hero-tile {r.balance >= 0 ? 'refund' : 'owe'}">
          <div class="lbl">Year-end balance</div>
          <div class="big">{r.balance >= 0 ? '+ ' + eur(r.balance) : '− ' + eur(-r.balance)}</div>
          <div class="sub">{r.balance >= 0 ? 'expected refund' : 'expected back-payment'}</div>
        </div>
      </div>

      <div class="dash">
        <div class="dash-cell">
          <!-- ============ CAPITAL INCOME ============ -->
          <div class="sec-title">
            <span class="n">4</span> Australian bank interest — capital income (taxed separately, flat 25%)
          </div>
          <div class="card">
            <div class="field" style="max-width:380px; margin-bottom:20px">
              <label>Australian bank interest received (gross, in €)</label>
              <div class="input">
                <span>€</span><input
                  type="number"
                  inputmode="numeric"
                  min="0"
                  step="500"
                  bind:value={interest}
                />
              </div>
            </div>
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
            {#if iNote}<p class="recon-note">{iNote}</p>{/if}
          </div>
        </div>
        <!-- /.dash-cell interest -->

        <div class="dash-cell">
          <!-- ============ ANNUAL INCOME TAX ============ -->
          <div class="sec-title">
            <span class="n">5</span> Annual income tax — the truth (tax classes don't change this)
          </div>
          <div class="total">
            <div>
              <div class="lbl">Total tax owed in Germany</div>
              <div class="big">{eur(r.annualTotal)}</div>
              <div class="lbl" style="margin-top:8px">
                Income tax <b style="color:var(--ink)">{eur(r.incomeTax)}</b> · Soli
                <b style="color:var(--ink)">{eur(r.annualSoli)}</b>
              </div>
            </div>
            <div class="rates">
              <div>
                <div class="lbl">Effective rate</div>
                <b>{pct(r.effective)}</b>
              </div>
              <div>
                <div class="lbl">Marginal rate</div>
                <b>{pct(r.marginal)}</b>
              </div>
            </div>
          </div>
          <div class="stats">
            <div class="stat">
              <div class="k">Combined taxable income (est. zvE)</div>
              <div class="v">{eur(r.zvE)}</div>
            </div>
            <div class="stat">
              <div class="k">Tax if the rent weren't counted</div>
              <div class="v">{eur(r.taxNoRent)}</div>
            </div>
            <div class="stat cost">
              <div class="k">Cost of the Australian rent (progression)</div>
              <div class="v">+ {eur(r.costOfRent)}</div>
            </div>
            <div class="stat">
              <div class="k">Special rate applied (bes. Steuersatz)</div>
              <div class="v">{pct(r.specialRate)}</div>
            </div>
          </div>
        </div>
        <!-- /.dash-cell income tax -->

        <div class="dash-cell">
          <!-- ============ MONTHLY TAKE-HOME ============ -->
          <div class="sec-title"><span class="n">6</span> Monthly take-home — net income breakdown</div>
          <div class="card" style="padding:8px 8px 0">
            <div class="table-scroll">
              <table>
                <thead
                  ><tr
                    ><th>Per month</th><th>You <span class="cls-pill">{classYou}</span></th><th
                      >Wife <span class="cls-pill">{classWife}</span></th
                    ><th>Together</th></tr
                  ></thead
                >
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
            <div class="stats" style="margin-top:14px">
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
        </div>
        <!-- /.dash-cell monthly -->

        <div class="dash-cell">
          <!-- ============ RECONCILIATION ============ -->
          <div class="sec-title"><span class="n">7</span> Year-end reconciliation</div>
          <div class="card">
            <div class="recon">
              <div class="leg">
                <div class="lbl">Withheld over the year</div>
                <div class="v">{eur(r.withheld)}</div>
              </div>
              <div class="arrow">vs</div>
              <div class="leg">
                <div class="lbl">True annual liability</div>
                <div class="v">{eur(r.annualTotal)}</div>
              </div>
              <div class="balance {r.balance >= 0 ? 'refund' : 'owe'}">
                <div class="lbl">{r.balance >= 0 ? 'Expected refund' : 'Expected back-payment'}</div>
                <div class="v">{r.balance >= 0 ? '+ ' + eur(r.balance) : '− ' + eur(-r.balance)}</div>
              </div>
            </div>
            <p class="recon-note">{rNote}</p>
          </div>
        </div>
        <!-- /.dash-cell reconciliation -->

        <div class="dash-cell">
          <!-- ============ FINE-TUNER ============ -->
          <div class="sec-title"><span class="n">8</span> Fine-tuner — nudge the levers you control</div>
          <div class="card">
            <div class="field">
              <label
                >Additional deductions (€/yr) — extra Werbungskosten, Sonderausgaben, deductible pension or
                freelance expenses</label
              >
              <div class="tuner-row">
                <input type="range" min="0" max="30000" step="250" bind:value={deductions} />
                <div class="input" style="width:160px">
                  <span>€</span><input
                    type="number"
                    min="0"
                    max="200000"
                    step="250"
                    bind:value={deductions}
                  />
                </div>
              </div>
            </div>
            <div class="stats" style="margin-top:6px">
              <div class="stat">
                <div class="k">Taxable income after deductions</div>
                <div class="v">{eur(r.zvE)}</div>
              </div>
              <div class="stat">
                <div class="k">Income tax saved (deductions)</div>
                <div class="v" style="color:var(--good)">
                  {deductionsSaved > 0 ? '− ' + eur(deductionsSaved) : eur(0)}
                </div>
              </div>
              <div class="stat">
                <div class="k">New total German tax</div>
                <div class="v">{eur(r.grandTotal)}</div>
              </div>
              <div class="stat">
                <div class="k">Year-end balance now</div>
                <div class="v" style="color:{r.balance >= 0 ? 'var(--good)' : 'var(--bad)'}">
                  {r.balance >= 0 ? '+ ' + eur(r.balance) : '− ' + eur(Math.abs(r.balance))}
                </div>
              </div>
            </div>

            <div style="margin-top:24px">
              <div
                style="font-size:12px; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); font-weight:600; margin-bottom:12px"
              >
                Tax-class comparison — same total tax, only the cash-flow timing differs
              </div>
              <div class="table-scroll">
                <table>
                  <thead><tr><th>Combo</th><th>Combined net / month</th><th>Year-end balance</th></tr></thead>
                  <tbody>
                    {#each rows as row (row.a + '+' + row.b)}
                      {@const cur = row.a === classYou && row.b === classWife}
                      <tr class:cur>
                        <td>{row.a} + {row.b}{cur ? ' · current' : ''}</td>
                        <td
                          >{eur(row.net)}{#if row.net === bestNet}<span class="recommend">
                              ▲ most cash</span
                            >{/if}</td
                        >
                        <td style="color:{row.bal >= 0 ? 'var(--good)' : 'var(--bad)'}"
                          >{row.bal >= 0 ? '+ ' + eur(row.bal) : '− ' + eur(Math.abs(row.bal))}</td
                        >
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
              <p class="recon-note">{comboNote}</p>
            </div>
          </div>
        </div>
        <!-- /.dash-cell fine-tuner -->

        <div class="dash-cell">
          <!-- ============ DENKMAL-AfA ============ -->
          <div class="sec-title">
            <span class="n">9</span> Denkmal-AfA — listed-building renovation (§10f)
          </div>
          <div class="card">
            <div class="row2">
              <div class="field">
                <label>Total eligible renovation costs (owner-occupied)</label>
                <div class="input">
                  <span>€</span><input
                    type="number"
                    inputmode="numeric"
                    min="0"
                    step="5000"
                    bind:value={denkmalCost}
                  />
                </div>
              </div>
              <div class="field">
                <label>Written off this year (9%)</label>
                <div class="static-field" style="color:var(--accent2)">
                  {eur(r.denkmalAfA)}
                  <span style="color:var(--muted); font-size:13px">· 9%/yr for 10 years</span>
                </div>
              </div>
            </div>
            <div class="stats" style="margin-top:16px">
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
                <div class="v" style="color:var(--good)">
                  {denkmalSaved > 0 ? '− ' + eur(denkmalSaved) : eur(0)}
                </div>
              </div>
            </div>
            {#if r.denkmalAfA > 0}
              <p class="recon-note">
                The {eur(r.denkmalAfA)} write-off lowers your taxable income, cutting this year's payable income
                tax (incl. Soli) from {eur(noDenkmal.annualTotal)} to {eur(r.annualTotal)} — a saving of {eur(
                  denkmalSaved,
                )}, repeatable for 10 years.
              </p>
            {/if}
          </div>
        </div>
        <!-- /.dash-cell denkmal -->
      </div>
      <!-- /.dash -->
    </div>
    <!-- /.results -->
  </div>
  <!-- /.panes -->

  <p class="assumptions">
    <b>Approximate — for orientation only, not tax advice or a Lohnabrechnung.</b>
    Tax year {year}, married filing jointly, <b>statutory health insurance</b> (Zusatzbeitrag and number of
    children are your inputs above), <b>no church tax</b>. Children lower your Pflegeversicherung rate and
    your Soli base, but — as in the real withholding system — they do <b>not</b> reduce your Lohnsteuer or
    income tax (no Kindergeld/Kinderfreibetrag Günstigerprüfung is modelled). Lohnsteuer is estimated from the
    §32a tariff per class with a standard Vorsorgepauschale; expect it within a few percent of your real
    payslip. Taxable income is estimated from gross via social-security contributions plus the standard
    allowances.
    <b>Freelance income</b> (freiberuflich, §18) is added to your taxable income and taxed at your normal rate
    (no Gewerbesteuer); it has no withholding, so in reality you pre-pay it via quarterly Vorauszahlungen. The
    Australian rent is treated as exempt-but-progression-relevant (§32b EStG). Australian
    <b>bank interest</b> is taxed separately at the flat 25% Abgeltungsteuer + 5.5% Soli (no Freigrenze) after
    the €2,000 saver's allowance, with the 10% Australian treaty withholding credited — it does <b>not</b>
    affect your salary's tax rate, and excess foreign withholding isn't refundable. The fine-tuner's
    <b>additional deductions</b>
    simply lower your taxable income (enter the net deductible total — real deductions have their own caps); tax
    classes change only your monthly cash flow, never the total annual tax. The <b>Denkmal-AfA</b> (§10f, owner-occupied)
    writes off 9% of the entered renovation costs each year for 10 years as a Sonderausgabe; eligibility (listed-building
    status, the costs that qualify, the official Bescheinigung from the Denkmalbehörde) is assumed — confirm it
    with your Steuerberater.
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
  :global(:root) {
    --bg: #131416;
    --panel: #1e2023;
    --panel2: #26282d;
    --line: rgba(255, 255, 255, 0.09);
    --border: rgba(255, 255, 255, 0.09);
    --ink: #ecedef;
    --muted: #969aa1;
    --paper: #1a1205;
    --accent: #ff6b2c;
    --accent2: #ffa24d;
    --good: #36c28b;
    --warn: #e0a23a;
    --bad: #f0685c;
    --font-body: 'Hanken Grotesk Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    --font-display: var(--font-body);
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
  }
  .wrap {
    max-width: 980px;
    margin: 0 auto;
  }
  .wrap > * {
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
    .wrap > * {
      animation: none;
    }
  }

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
    font-family: var(--font-display);
    font-weight: 800;
    font-size: clamp(34px, 6vw, 58px);
    line-height: 1.02;
    letter-spacing: -0.03em;
    margin: 22px 0 10px;
  }
  .lede {
    color: var(--muted);
    font-size: 18px;
    margin: 0 0 6px;
    max-width: 640px;
    line-height: 1.5;
  }

  .sec-title {
    font-size: 12px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--muted);
    font-weight: 700;
    margin: 46px 0 16px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .sec-title:first-of-type {
    margin-top: 34px;
  }
  .sec-title .n {
    display: inline-flex;
    width: 26px;
    height: 26px;
    border-radius: 8px;
    background: linear-gradient(140deg, #ff7c3d, #f2521a);
    color: var(--paper);
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .grid {
    display: grid;
    gap: 16px;
  }
  .cols2 {
    grid-template-columns: 1fr 1fr;
  }
  @media (max-width: 780px) {
    .cols2 {
      grid-template-columns: 1fr;
    }
  }
  .row3 {
    display: grid;
    grid-template-columns: 1.4fr 1fr 1fr;
    gap: 18px;
  }
  .row3 .field {
    margin: 0;
  }
  @media (max-width: 780px) {
    .row3 {
      grid-template-columns: 1fr 1fr;
    }
  }
  @media (max-width: 520px) {
    .row3 {
      grid-template-columns: 1fr;
    }
  }
  .row2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 18px;
  }
  .row2 .field {
    margin: 0;
  }
  @media (max-width: 560px) {
    .row2 {
      grid-template-columns: 1fr;
    }
  }

  .card {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 22px 24px;
  }
  .card h3 {
    margin: 0 0 16px;
    font-weight: 700;
    font-size: 19px;
    letter-spacing: -0.01em;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  label {
    display: block;
    font-size: 13px;
    color: var(--muted);
    margin: 0 0 8px;
    font-weight: 500;
  }
  .field {
    margin: 0 0 18px;
  }
  .field:last-child {
    margin-bottom: 0;
  }
  .input {
    position: relative;
  }
  .input span {
    position: absolute;
    left: 15px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--muted);
    font-size: 17px;
    font-weight: 600;
  }
  input {
    width: 100%;
    background: var(--panel2);
    border: 1px solid var(--line);
    border-radius: 11px;
    color: var(--ink);
    font-family: var(--font-body);
    font-size: 20px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    padding: 13px 14px 13px 34px;
    outline: none;
    transition:
      box-shadow 0.12s,
      border-color 0.12s;
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

  .static-field {
    background: var(--panel2);
    border: 1px solid var(--line);
    border-radius: 11px;
    color: var(--ink);
    font-size: 17px;
    font-weight: 700;
    padding: 14px 14px;
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
  .year-field {
    max-width: 240px;
  }
  select {
    width: 100%;
    background: var(--panel2);
    border: 1px solid var(--line);
    border-radius: 11px;
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

  .classes {
    display: flex;
    gap: 8px;
  }
  .classes button {
    flex: 1;
    background: var(--panel2);
    border: 1px solid var(--line);
    color: var(--ink);
    border-radius: 10px;
    padding: 11px 0;
    font-family: var(--font-body);
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
    transition: 0.12s;
  }
  .classes button.on {
    background: linear-gradient(140deg, #ff7c3d, #f2521a);
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
    margin: 0 0 16px;
  }

  /* hero blocks */
  .total {
    background: linear-gradient(180deg, #23262b, #1c1e22);
    border: 1px solid var(--line);
    border-radius: 18px;
    padding: 26px 28px;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 18px;
  }
  .total .lbl {
    font-size: 12px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
    font-weight: 600;
  }
  .total .big {
    font-size: clamp(40px, 6vw, 56px);
    font-weight: 800;
    letter-spacing: -0.03em;
    font-variant-numeric: tabular-nums;
    line-height: 0.98;
    color: var(--ink);
  }
  .total .rates {
    display: flex;
    gap: 30px;
    text-align: right;
  }
  .total .rates .lbl {
    margin-bottom: 5px;
  }
  .total .rates b {
    font-size: 25px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    color: var(--accent);
  }

  .net-banner {
    background: linear-gradient(135deg, #ff7c3d, #ee4f18);
    border-color: transparent;
  }
  .net-banner .lbl {
    color: rgba(26, 18, 5, 0.66);
  }
  .net-banner .big {
    color: var(--paper);
  }
  .net-banner .rates b {
    color: var(--paper);
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 14px;
    margin-top: 16px;
  }
  @media (max-width: 780px) {
    .stats {
      grid-template-columns: 1fr 1fr;
    }
  }
  .stat {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 16px 18px;
  }
  .stat .k {
    font-size: 12px;
    color: var(--muted);
    margin-bottom: 12px;
    min-height: 30px;
    line-height: 1.35;
  }
  .stat .v {
    font-size: 24px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
  }
  .stat.cost .v {
    color: var(--warn);
  }

  /* tables */
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
    padding: 13px 14px;
    text-align: right;
    border-bottom: 1px solid var(--line);
    font-variant-numeric: tabular-nums;
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
  }
  td {
    color: var(--ink);
    font-weight: 500;
  }
  tr.net td {
    font-weight: 800;
    border-bottom: none;
    background: rgba(255, 107, 44, 0.12);
  }
  .cls-pill {
    display: inline-block;
    font-size: 11px;
    font-weight: 700;
    color: var(--accent2);
    border: 1px solid rgba(255, 162, 77, 0.5);
    border-radius: 6px;
    padding: 1px 7px;
    margin-left: 8px;
  }

  /* reconciliation */
  .recon {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 18px;
  }
  .recon .leg {
    flex: 1;
    min-width: 170px;
  }
  .recon .leg .lbl {
    font-size: 12px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 7px;
    font-weight: 600;
  }
  .recon .leg .v {
    font-size: 27px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
  }
  .recon .arrow {
    color: var(--muted);
    font-size: 20px;
    font-style: italic;
  }
  .balance {
    border-radius: 14px;
    padding: 18px 22px;
    text-align: right;
    min-width: 210px;
    border: 1px solid var(--line);
  }
  .balance.refund {
    background: rgba(54, 194, 139, 0.12);
    border-color: rgba(54, 194, 139, 0.4);
  }
  .balance.owe {
    background: rgba(240, 104, 92, 0.12);
    border-color: rgba(240, 104, 92, 0.4);
  }
  .balance .lbl {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
    margin-bottom: 7px;
    font-weight: 600;
  }
  .balance .v {
    font-size: 31px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
  }
  .balance.refund .v {
    color: var(--good);
  }
  .balance.owe .v {
    color: var(--bad);
  }
  .recon-note {
    color: var(--muted);
    font-size: 13px;
    margin: 16px 0 0;
    line-height: 1.65;
  }

  /* fine-tuner */
  .tuner-row {
    display: flex;
    gap: 16px;
    align-items: center;
  }
  input[type='range'] {
    flex: 1;
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
    background: linear-gradient(140deg, #ff7c3d, #f2521a);
    border: none;
    cursor: pointer;
  }
  input[type='range']::-moz-range-thumb {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: linear-gradient(140deg, #ff7c3d, #f2521a);
    border: none;
    cursor: pointer;
  }
  input[type='range']:focus {
    box-shadow: 0 0 0 3px rgba(255, 107, 44, 0.18);
  }
  tr.cur td {
    background: rgba(255, 107, 44, 0.1);
  }
  tr.cur td:first-child {
    font-weight: 800;
  }
  .recommend {
    color: var(--accent);
    font-weight: 700;
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

  /* cookie consent */
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
    background: linear-gradient(140deg, #ff7c3d, #f2521a);
    border-color: transparent;
    color: var(--paper);
  }

  /* phones */
  @media (max-width: 560px) {
    :global(body) {
      padding: 30px 14px 110px;
    }
    .lede {
      font-size: 16px;
    }
    .sec-title {
      margin: 34px 0 14px;
    }
    .card {
      padding: 18px 16px;
    }
    .total {
      flex-direction: column;
      align-items: stretch;
      gap: 16px;
      padding: 20px;
    }
    .total .rates {
      width: 100%;
      justify-content: space-between;
      text-align: left;
      gap: 16px;
    }
    th,
    td {
      padding: 10px 11px;
      font-size: 13px;
    }
    .recon {
      flex-direction: column;
      align-items: stretch;
      gap: 14px;
    }
    .recon .arrow {
      display: none;
    }
    .balance {
      min-width: 0;
      text-align: left;
    }
    .tuner-row {
      flex-direction: column;
      align-items: stretch;
    }
    .tuner-row .input {
      width: 100% !important;
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
