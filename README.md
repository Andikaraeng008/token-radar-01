# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Andikaraeng008/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Andikaraeng008/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks 198 pre-token protocols from the sealed DefiLlama snapshot (14 Nov 2026) by implied launch value, and shows a reader how to farm each one. The value model is calibrated from the snapshot itself: each category's multiple is the median market-cap-to-TVL ratio of that category's protocols whose token already trades, shrunk toward the overall median of 0.17 and bounded to 0.10–1.00, then combined with seven-day TVL growth and the protocol's age with no token. The dashboard is a static page — sortable, filterable by category and chain, with a detail view carrying the model's equation and a six-step farm plan for every protocol, and a live-token view that sets the already-trading protocols apart with their market caps.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Node 22.18 or later, standard library only. The program writes `out/board.json`, `out/data.js`, `out/dashboard/`, `out/screenshots/` and `out/dossier.json`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=fkrw3nqq&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
