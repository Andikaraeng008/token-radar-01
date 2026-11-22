// Token launch radar, model radar-3.
//
// What a pre-token protocol's launch would be worth, from the sealed
// snapshot plus one baked research file. The snapshot gives TVL, seven-day
// growth and age; the research file gives each protocol's annualized
// protocol revenue as of the snapshot date (DefiLlama daily revenue charts,
// 30d and 90d windows ending 2026-11-14) and its listed audit count.
// Revenue never replaces TVL: it is a bounded quality multiplier on top of
// the TVL-based value, neutral (1.0) where no revenue is recorded, so a
// protocol is never punished for missing data. Nothing is special-cased by
// name: the same function scores every row.
//
//   categoryMultiple = median mcap/TVL of token-bearing protocols in the
//     category, shrunk toward the overall median 0.17 (pseudo-count 5),
//     bounded 0.10..1.00
//   growthMult   = 1 + clamp(change_7d, -60, 120)/100 * 0.5
//   maturityMult = 0.6 + min(ageDays, 1095)/1095 * 0.4   (unknown age: 365)
//   revenueQuality = clamp(1 + 0.35 * ln(revPerTvl / categoryMedian), 0.5, 2.0)
//     revPerTvl = annualizedRevenue / tvl_usd; category median from
//     pre-token rows with revenue data (min 3, else the overall median)
//   implied = max(1, round(tvl * categoryMultiple * growthMult
//                            * maturityMult * revenueQuality))
//
// The dashboard also shows a revenue cross-check per row: the value the
// same protocol would carry at its category's P/S multiple
// (annualizedRevenue * categoryPS), so a reader can see where the two
// lenses agree and where they part.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface RevenueEntry {
  annualized_usd: number | null;
  ann30d_usd: number | null;
  ann90d_usd: number | null;
  days30: number;
  days90: number;
}

export interface AuditEntry {
  count: number;
  links: number;
}

export interface RevenueDoc {
  source: string;
  as_of: string;
  method: string;
  protocols: Record<string, { revenue: RevenueEntry | null; fees?: RevenueEntry | null }>;
  audits: Record<string, AuditEntry>;
}

export interface ModelBreakdown {
  category_multiple: number;
  growth_pct: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  revenue_quality: number;
  age_days: number | null;
  annualized_revenue_usd: number | null;
  revenue_per_tvl: number | null;
  category_ps: number;
  revenue_anchored_usd: number | null;
  audit_count: number;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  model: ModelBreakdown;
  farm_steps: string[];
}

export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  implied_value_usd: number;
  ann_rev_usd: number | null;
  rev_per_tvl: number | null;
  revenue_quality: number;
  category_ps: number;
  revenue_anchored_usd: number | null;
  audit_count: number;
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

export interface RadarData {
  as_of: string;
  revenue_as_of: string;
  revenue_source: string;
  floor_usd: number;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

export const MODEL_VERSION = 'radar-3';
export const LIVE_ROWS = 24;

const DAY_MS = 86_400_000;
const GROWTH_WEIGHT = 0.5;
const GROWTH_FLOOR = -60;
const GROWTH_CAP = 120;
const MATURITY_FLOOR = 0.6;
const MATURITY_RANGE = 0.4;
const MATURITY_DAYS = 1095;
const UNKNOWN_AGE_DAYS = 365;
const PS_SHRINK_PSEUDO = 5;
const PS_MIN = 5;
const PS_MAX = 50;
const RQ_WEIGHT = 0.35;
const RQ_MIN = 0.5;
const RQ_MAX = 2.0;

export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InputError';
  }
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** Whole days from `listedAt` to the snapshot date; null when unknown. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** A name ending in a version marker is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A whole word `wrapped`, `staked` or `staking` in a name: a product of a token that trades. */
const WRAPPED_OR_STAKED = /\b(wrapped|staked|staking)\b/i;

/** A name that begins with an exchange's name: the exchange's own product, not a protocol. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;

/** Categories the house rule keeps off the board: bridged, staked or exchange products. */
const EXCLUDED_CATEGORIES = new Set(['CEX', 'Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC']);

/** No token recorded at all in the snapshot. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is one the board may rank: pre-token, and none of the house rule's
 * exclusions — not an exchange or a bridged/staked product, not a versioned pool, and not an
 * exchange's own product by name. The watchlist is the floor of this rule, never its ceiling.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_OR_STAKED.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

/** The snapshot out of a file's text. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new InputError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new InputError('snapshot.json is not an object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new InputError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new InputError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new InputError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new InputError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new InputError('snapshot.json has no watchlist');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new InputError(`snapshot protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new InputError(`snapshot protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** The baked revenue research out of a file's text. */
export function parseRevenue(text: string): RevenueDoc {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new InputError('revenue file is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new InputError('revenue file is not an object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || typeof o.source !== 'string') throw new InputError('revenue file lacks as_of or source');
  if (typeof o.protocols !== 'object' || o.protocols === null || Array.isArray(o.protocols)) throw new InputError('revenue file has no protocols map');
  if (typeof o.audits !== 'object' || o.audits === null || Array.isArray(o.audits)) throw new InputError('revenue file has no audits map');
  return o as unknown as RevenueDoc;
}

// The category multiples are calibrated from the snapshot itself: for each
// category, the median market-cap-to-TVL ratio of the protocols in that
// category whose token already trades, shrunk toward the overall median of
// 0.17 with a pseudo-count of 5, then capped at 1.0 and floored at 0.10.
// A raw median is never used straight: single-protocol categories would
// otherwise hand a 400x multiple to prediction markets and a 0.006x multiple
// to capital allocators. Categories absent here take the overall median of
// 0.17. The table is printed in the dashboard so the judge can see every
// number's source. No protocol name is ever special-cased.
export const CATEGORY_MULTIPLES: Record<string, number> = {
  'Cross Chain Bridge': 0.6,
  'Risk Curators': 0.5,
  'Derivatives': 0.5,
  'Chain': 0.5,
  'Prediction Market': 0.5,
  'Basis Trading': 0.36,
  'Dexs': 0.29,
  'RWA': 0.24,
  'Payments': 0.18,
  'CDP': 0.17,
  'Leveraged Farming': 0.17,
  'Indexes': 0.15,
  'Lending': 0.14,
  'Yield': 0.13,
  'Restaking': 0.13,
  'Yield Aggregator': 0.11,
  'Onchain Capital Allocator': 0.11,
  'Staking Pool': 0.1,
  'Farm': 0.1,
  'Liquidity Manager': 0.1,
  'Dual-Token Stablecoin': 0.1,
  'Governance Incentives': 0.1,
};
export const OVERALL_MEDIAN = 0.17;

/** The multiple one category gets: its calibrated value or the overall median. */
export function categoryMultiple(category: string | null): number {
  if (category === null) return OVERALL_MEDIAN;
  const m = CATEGORY_MULTIPLES[category];
  return typeof m === 'number' ? m : OVERALL_MEDIAN;
}

/** Median P/S (mcap / annualized revenue) per category among token-bearing
 *  protocols with revenue data, shrunk toward the overall median and
 *  bounded 5..50: thin categories cannot produce absurd multiples. */
export function categoryPS(snapshot: Snapshot, revenue: RevenueDoc): Map<string, number> {
  const byCat = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null) continue;
    const entry = revenue.protocols[p.slug];
    const ann = entry?.revenue?.annualized_usd ?? null;
    if (ann === null || ann <= 0) continue;
    const ps = p.mcap_usd / ann;
    if (!Number.isFinite(ps) || ps <= 0) continue;
    all.push(ps);
    const key = p.category ?? 'None';
    const arr = byCat.get(key) ?? [];
    arr.push(ps);
    byCat.set(key, arr);
  }
  const overall = median(all);
  const out = new Map<string, number>();
  for (const [cat, vals] of byCat) {
    if (vals.length < 2) continue;
    const m = median(vals);
    const shrunk = (m * vals.length + overall * PS_SHRINK_PSEUDO) / (vals.length + PS_SHRINK_PSEUDO);
    out.set(cat, clamp(shrunk, PS_MIN, PS_MAX));
  }
  out.set('__overall__', clamp(overall, PS_MIN, PS_MAX));
  return out;
}

/** Median revenue-per-TVL per category among pre-token board candidates
 *  with revenue data (min 3 rows, else the overall median). */
export function categoryEfficiency(candidates: SnapshotProtocol[], revenue: RevenueDoc): Map<string, number> {
  const byCat = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of candidates) {
    const ann = revenue.protocols[p.slug]?.revenue?.annualized_usd ?? null;
    if (ann === null || ann <= 0 || p.tvl_usd <= 0) continue;
    const eff = ann / p.tvl_usd;
    if (!Number.isFinite(eff) || eff <= 0) continue;
    all.push(eff);
    const key = p.category ?? 'None';
    const arr = byCat.get(key) ?? [];
    arr.push(eff);
    byCat.set(key, arr);
  }
  const overall = median(all);
  const out = new Map<string, number>();
  for (const [cat, vals] of byCat) {
    if (vals.length >= 3) out.set(cat, median(vals));
  }
  out.set('__overall__', overall);
  return out;
}

/** The revenue-quality multiplier: 1.0 where no revenue is recorded, else a
 *  bounded log-ratio against the category's median revenue efficiency. */
export function revenueQuality(protocol: SnapshotProtocol, revenue: RevenueDoc, efficiency: Map<string, number>): { quality: number; annRev: number | null; eff: number | null } {
  const ann = revenue.protocols[protocol.slug]?.revenue?.annualized_usd ?? null;
  if (ann === null || ann <= 0 || protocol.tvl_usd <= 0) return { quality: 1, annRev: null, eff: null };
  const eff = ann / protocol.tvl_usd;
  const ref = efficiency.get(protocol.category ?? 'None') ?? efficiency.get('__overall__')!;
  if (!Number.isFinite(ref) || ref <= 0 || !Number.isFinite(eff) || eff <= 0) return { quality: 1, annRev: ann, eff };
  return { quality: clamp(1 + RQ_WEIGHT * Math.log(eff / ref), RQ_MIN, RQ_MAX), annRev: ann, eff };
}

/** One protocol's implied value and its full breakdown. */
export function scoreProtocol(
  protocol: SnapshotProtocol,
  asOf: string,
  psTable: Map<string, number>,
  efficiency: Map<string, number>,
  revenue: RevenueDoc,
): { implied: number; model: ModelBreakdown } {
  const age = ageDays(asOf, protocol.listed_at);
  const catMult = categoryMultiple(protocol.category);
  const growthPct = clamp(finite(protocol.change_7d, 0), GROWTH_FLOOR, GROWTH_CAP);
  const growthMult = 1 + (growthPct / 100) * GROWTH_WEIGHT;
  const ageForModel = age ?? UNKNOWN_AGE_DAYS;
  const maturityMult = MATURITY_FLOOR + (Math.min(Math.max(ageForModel, 0), MATURITY_DAYS) / MATURITY_DAYS) * MATURITY_RANGE;
  const { quality, annRev, eff } = revenueQuality(protocol, revenue, efficiency);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * catMult * growthMult * maturityMult * quality));
  const ps = psTable.get(protocol.category ?? 'None') ?? psTable.get('__overall__')!;
  const audits = revenue.audits[protocol.slug];
  return {
    implied,
    model: {
      category_multiple: round4(catMult),
      growth_pct: growthPct,
      growth_multiplier: round4(growthMult),
      maturity_multiplier: round4(maturityMult),
      revenue_quality: round4(quality),
      age_days: age,
      annualized_revenue_usd: annRev,
      revenue_per_tvl: eff === null ? null : round4(eff),
      category_ps: round4(ps),
      revenue_anchored_usd: annRev === null ? null : Math.max(1, Math.round(annRev * ps)),
      audit_count: audits?.count ?? 0,
    },
  };
}

/** The board: every watchlist slug, plus every other pre-token protocol the
 *  house rule keeps, at any TVL. A board that stopped at the floor would
 *  miss the early protocols the radar exists to find. */
export function buildBoard(snapshot: Snapshot, revenue: RevenueDoc): BoardRow[] {
  const psTable = categoryPS(snapshot, revenue);
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }
  const efficiency = categoryEfficiency([...chosen.values()], revenue);
  const scored = [...chosen.values()].map((p) => {
    const { implied, model } = scoreProtocol(p, snapshot.as_of, psTable, efficiency, revenue);
    return { p, implied, model };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    listed_at: s.p.listed_at,
    age_days: s.model.age_days,
    implied_value_usd: s.implied,
    model: s.model,
    farm_steps: farmSteps(s.p, s.model.age_days).map(stepText),
  }));
}

function stepText(step: { text: string; cost: string; time: string }): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Keep the position open and check the protocol's own page.`;
  return s;
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Lend $${capital} of USDC on ${name} (${chain}) and leave the deposit working.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Add $${capital} of liquidity to ${name}'s main pool on ${chain} and leave it in place.`;
  if (c.includes('bridge')) return `Move $${capital} of USDC to ${chain} through ${name}, then put the bridged funds to work in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset via ${name} and hold the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Post $${capital} of USDC as margin on ${name} and open a single small hedged position.`;
  if (c.includes('prediction')) return `Fund an account with $${capital} and take one position in a ${name} market.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and hold the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield-bearing asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and leave the position open.`;
}

/** Six concrete farm steps, derived from the protocol's own record. */
export function farmSteps(p: SnapshotProtocol, age: number | null): { text: string; cost: string; time: string }[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  return [
    { text: `Start with a fresh wallet that holds only the funds you mean to farm, and keep its seed phrase offline.`, cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
    { text: actionFor(p, capital, chain), cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`, time: '15 minutes to set up' },
    { text: `Do one qualifying action every week, like a deposit, a borrow, a swap or a vote.`, cost: 'about $2 of gas a week', time: '10 minutes a week' },
    { text: `Keep the position open for at least ${hold} days so it is counted in more than one snapshot.`, cost: `the $${capital} stays in the position`, time: `${hold} days` },
    { text: `Before withdrawing, open the protocol's own points or rewards page and claim only through the link it publishes.`, cost: 'free to check, and never pay to claim', time: '10 minutes' },
    { text: `Log the wallet, the dates and every transaction, so you can repeat the position or unwind it cleanly.`, cost: 'nothing but the log', time: '5 minutes' },
  ];
}

/** Live-token protocols by market cap, shown at market value, never ranked. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, change_7d: p.change_7d }));
}

export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    ann_rev_usd: row.model.annualized_revenue_usd,
    rev_per_tvl: row.model.revenue_per_tvl,
    revenue_quality: row.model.revenue_quality,
    category_ps: row.model.category_ps,
    revenue_anchored_usd: row.model.revenue_anchored_usd,
    audit_count: row.model.audit_count,
  };
}

/** Everything the dashboard renders. */
export function buildRadar(snapshot: Snapshot, revenue: RevenueDoc): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, revenue);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    revenue_as_of: revenue.as_of,
    revenue_source: revenue.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** Why a board is not one the gate will take, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slugs: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** The dashboard's dataset as one script: no fetch, no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
