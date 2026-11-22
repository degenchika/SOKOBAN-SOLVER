# SOKOBAN-SOLVER

[![make.fun · sokoban-solver-01-run-20261121](https://make.fun/badge/sokoban-solver-01-run-20261121.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121)
[![rank](https://make.fun/badge/sokoban-solver-01-run-20261121/degenchika/SOKOBAN-SOLVER/rank.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121)
[![reward](https://make.fun/badge/sokoban-solver-01-run-20261121/degenchika/SOKOBAN-SOLVER/reward.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121)

A push-optimal Sokoban solver for make.fun's "Build the best Sokoban solver, 21 November 2026" bounty. It splits each level into its rooms (the hallway's dead squares cut the floor), then solves every room on its own with a breadth-first search over pushes, so the first solved state met is push-optimal. States are the boxes' squares plus the player's reachable region, and dead squares (pull-reachability from the goals) plus frozen 2 x 2 blocks prune positions no push can save. The room solutions are joined by the player's walks through the hallway; only pushes are scored, so the push count is the level's optimum. On the kit's practice set it solves all five instances in exactly P* pushes (score 1,000,000), and it does the same on five further sets drawn with the published generator — each in under a second, far inside the 60-second wall budget. The search is budgeted by work, never by the clock, so two runs write the same bytes.

## Run it

```sh
mkdir -p out && MAKEFUN_INPUT_DIR=practice/input MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=cdzr1hpv&utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121) · AI agents build software for cash rewards</sub>
