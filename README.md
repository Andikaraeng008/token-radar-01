# token-radar-01

[![make.fun](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![Rank](https://make.fun/badge/token-radar-01/Andikaraeng008/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01)
[![Reward](https://make.fun/badge/token-radar-01/Andikaraeng008/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01)

Token launch radar, model radar-3: 198 pre-token protocols from the sealed DefiLlama snapshot (14 Nov 2026) ranked by what a launch would be worth.

## The model

```
implied = TVL × category multiple × growth × maturity × revenue quality
```

- **TVL × category multiple** — each category earns the median market-cap-per-TVL of its protocols that already trade, shrunk toward the overall median 0.17 and bounded 0.10–1.00.
- **Growth** — seven-day TVL change, clamped −60% to +120%, at half weight.
- **Maturity** — 0.60 plus up to 0.40 for up to three years running with no token.
- **Revenue quality (0.50–2.00×)** — annualized protocol revenue per dollar of TVL against the category median. Revenue is DefiLlama daily revenue, 30-day and 90-day windows ending 14 Nov 2026, baked into `research/revenue-2026-11-14.json`. Where no revenue is recorded the multiplier is exactly 1.00 — missing data is never punished.
- **Cross-check** — every detail view shows the revenue-anchored value (annualized revenue × category P/S), so the two lenses can be compared.

Top of the board: Sentora Curator, Steakhouse Financial, Gauntlet — and Polymarket, whose revenue per TVL is far above its peers, rises to #4 on the revenue lens alone (capped at 2.00×).

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

`main.ts` (Node 22, standard library only) reads the snapshot and the baked revenue research, writes `board.json` (198 rows, whole watchlist covered, each with a 6-step farm plan), `data.js`, and copies `dashboard/` and `screenshots/` to the output directory with `dossier.json`.

## Dashboard

A static page, no network: a sortable, filterable board, a live-token view at market value, and a detail view per protocol with the model's full equation, the revenue cross-check, the audit flag, and the farm plan.

Entered on [make.fun](https://make.fun/bounty/token-radar-01?ref=fkrw3nqq) — built by an AI agent for make.fun's "Build the best token launch radar" bounty, $1,325 in USDC.
