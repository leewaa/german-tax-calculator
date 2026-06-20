// German income tax, 2024, married/jointly. Pure functions — no DOM, no side effects.
// Math is identical to legacy/index.html; only types are added.

export type TaxClass = 'III' | 'IV' | 'V'

export interface HouseholdInput {
  grossYou: number; classYou: TaxClass
  grossWife: number; classWife: TaxClass
  ausRent: number; zusatzPct: number; kids: number
  interest: number; freelance: number
  deductions: number; denkmalCost: number
}
export interface PersonResult {
  g: number; cls: TaxClass; ls: number; slz: number
  svA: number; netA: number; withheld: number
}
export interface CapitalIncomeResult {
  interest: number; taxable: number; abgGross: number; auWHT: number
  auCredit: number; abgNet: number; soliInt: number; germanDue: number
}
export interface TaxResult {
  zvE: number; specialRate: number; incomeTax: number; taxNoRent: number
  costOfRent: number; annualSoli: number; annualTotal: number
  marginal: number; effective: number
  p1: PersonResult; p2: PersonResult
  withheld: number; balance: number; combined: number
  cap: CapitalIncomeResult; grandTotal: number
  freelance: number; freelanceTax: number; denkmalAfA: number
}

/* ---------- 2024 constants ---------- */
const RV = 0.093, ALV = 0.013
const BBG_RV = 90600, BBG_KV = 62100, AN_PB = 1230, SO_PB = 36
const KFB_PER_CHILD = 9312
const SPB_MARRIED = 2000, ABG = 0.25, AU_WHT = 0.10
const DENKMAL_RATE = 0.09

export const kvRate = (zusatzPct: number): number => 0.073 + (zusatzPct / 100) / 2
export const pvRate = (kids: number): number => {
  if (kids <= 0) return 0.023
  return Math.max(0.007, 0.017 - 0.0025 * (Math.min(kids, 5) - 1))
}

/* ---------- §32a EStG 2024 ---------- */
export function grundtarif(x: number): number {
  x = Math.floor(x)
  if (x <= 11604) return 0
  if (x <= 17005) { const y = (x - 11604) / 10000; return Math.floor((922.98 * y + 1400) * y) }
  if (x <= 66760) { const z = (x - 17005) / 10000; return Math.floor((181.19 * z + 2397) * z + 1025.38) }
  if (x <= 277825) return Math.floor(0.42 * x - 10602.13)
  return Math.floor(0.45 * x - 18936.88)
}
export const splittingTax = (x: number): number => x <= 0 ? 0 : 2 * grundtarif(Math.floor(x / 2))

/* ---------- gross → contributions / taxable wage ---------- */
export const sv = (g: number, zus: number, kids: number): number =>
  (RV + ALV) * Math.min(g, BBG_RV) + (kvRate(zus) + pvRate(kids)) * Math.min(g, BBG_KV)
const vorsorge = (g: number, zus: number, kids: number): number =>
  RV * Math.min(g, BBG_RV) + (kvRate(zus) + pvRate(kids)) * Math.min(g, BBG_KV)
export const taxableWage = (g: number, zus: number, kids: number): number =>
  Math.max(0, g - vorsorge(g, zus, kids) - AN_PB - SO_PB)

/* ---------- Lohnsteuer by tax class (§39b Abs. 2) ---------- */
export function lohnsteuerV(X: number): number {
  X = Math.floor(X)
  if (X <= 0) return 0
  const diff = 2 * (grundtarif(Math.floor(1.25 * X)) - grundtarif(Math.floor(0.75 * X)))
  let lo: number, hi: number
  if (X <= 34939) lo = 0.14 * X
  else if (X <= 222260) lo = 0.14 * 34939 + 0.42 * (X - 34939)
  else lo = 0.14 * 34939 + 0.42 * (222260 - 34939) + 0.45 * (X - 222260)
  if (X <= 14071) hi = 0.14 * X
  else if (X <= 222260) hi = 0.14 * 14071 + 0.42 * (X - 14071)
  else hi = 0.14 * 14071 + 0.42 * (222260 - 14071) + 0.45 * (X - 222260)
  return Math.floor(Math.min(Math.max(diff, lo), hi))
}
export function lohnsteuer(X: number, cls: TaxClass): number {
  if (X <= 0) return 0
  if (cls === 'III') return splittingTax(X)
  if (cls === 'V') return lohnsteuerV(X)
  return grundtarif(X)
}
export const soli = (tax: number, kind: TaxClass | 'joint'): number => {
  const fg = (kind === 'joint' || kind === 'III') ? 36260 : 18130
  if (tax <= fg) return 0
  return Math.min(0.119 * (tax - fg), 0.055 * tax)
}

/* ---------- capital income: Australian bank interest (§32d) ---------- */
export function capitalIncomeTax(interest: number): CapitalIncomeResult {
  interest = Math.max(0, interest || 0)
  const taxable = Math.max(0, interest - SPB_MARRIED)
  const abgGross = Math.round(ABG * taxable)
  const auWHT = Math.round(AU_WHT * interest)
  const auCredit = Math.min(auWHT, abgGross)
  const abgNet = abgGross - auCredit
  const soliInt = Math.round(0.055 * abgNet)
  return { interest, taxable, abgGross, auWHT, auCredit, abgNet, soliInt, germanDue: abgNet + soliInt }
}

/* ---------- full calculation ---------- */
export function calculate(input: HouseholdInput): TaxResult {
  const g1 = Math.max(0, input.grossYou || 0), c1 = input.classYou
  const g2 = Math.max(0, input.grossWife || 0), c2 = input.classWife
  const ausRent = Math.max(0, input.ausRent || 0)
  const zus = Math.max(0, input.zusatzPct || 0)
  const kids = Math.max(0, Math.floor(input.kids || 0))
  const interest = Math.max(0, input.interest || 0)
  const freelance = Math.max(0, input.freelance || 0)
  const deductions = Math.max(0, input.deductions || 0)
  const denkmalCost = Math.max(0, input.denkmalCost || 0)

  const denkmalAfA = Math.round(DENKMAL_RATE * denkmalCost)
  const X1 = taxableWage(g1, zus, kids), X2 = taxableWage(g2, zus, kids)
  const zvE = Math.max(0, X1 + X2 + freelance - deductions - denkmalAfA)
  const totalKFB = kids * KFB_PER_CHILD

  const combined = zvE + ausRent
  const specialRate = combined > 0 ? splittingTax(combined) / combined : 0
  const incomeTax = Math.floor(specialRate * zvE)
  const taxNoRent = splittingTax(zvE)
  const costOfRent = Math.max(0, incomeTax - taxNoRent)

  const zvE0 = Math.max(0, X1 + X2 - deductions - denkmalAfA), comb0 = zvE0 + ausRent
  const rate0 = comb0 > 0 ? splittingTax(comb0) / comb0 : 0
  const freelanceTax = Math.max(0, incomeTax - Math.floor(rate0 * zvE0))
  const soliBaseTax = Math.floor(specialRate * Math.max(0, zvE - totalKFB))
  const annualSoli = Math.round(soli(soliBaseTax, 'joint'))
  const annualTotal = incomeTax + annualSoli
  const marginal = combined > 0 ? (splittingTax(combined + 100) - splittingTax(combined)) / 100 : 0
  const effective = zvE > 0 ? annualTotal / zvE : 0

  const person = (g: number, X: number, cls: TaxClass): PersonResult => {
    const ls = lohnsteuer(X, cls)
    const kfb = cls === 'III' ? totalKFB : cls === 'V' ? 0 : totalKFB / 2
    const slz = Math.round(soli(lohnsteuer(Math.max(0, X - kfb), cls), cls))
    const svA = sv(g, zus, kids)
    const netA = g - svA - ls - slz
    return { g, cls, ls, slz, svA, netA, withheld: ls + slz }
  }
  const p1 = person(g1, X1, c1), p2 = person(g2, X2, c2)

  const withheld = p1.withheld + p2.withheld
  const balance = withheld - annualTotal

  const cap = capitalIncomeTax(interest)
  const grandTotal = annualTotal + cap.germanDue

  return {
    zvE, specialRate, incomeTax, taxNoRent, costOfRent, annualSoli, annualTotal,
    marginal, effective, p1, p2, withheld, balance, combined, cap, grandTotal,
    freelance, freelanceTax, denkmalAfA,
  }
}
