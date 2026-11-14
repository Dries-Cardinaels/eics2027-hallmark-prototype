# Paper configuration: illustrative route selection rule

**Status: Approved by the authors, 6 Nov 2026.** (Plan step 6.1; D2 package B; ground rule 9.)

Rule id: `middle-row-transect`.
Code: `prototype/editor/paper-config.js` (`PAPER_ROUTE_RULE`, `paperRouteEndpoints`, `paperRoute`); `prototype/editor/app.js` runs no planner in paper mode.
Test: `prototype/tests/paper-configuration.test.mjs` ("the illustrative route follows the written rule").

## Rule

The paper configuration (URL flag `paper=1`: run `npm run editor` in `prototype/`, open http://127.0.0.1:8772/editor/?paper=1) shows one route as inspectable context. The user does not plan it and it is never replanned.

1. **Row.** The middle native row of the crop: `row = floor(H / 2)`.
2. **Cells.** Every native column on that row that has a slope result, from the first to the last analysis column, in order.
3. **No planner, no cost.** The route is a straight transect. No path planner, cost model, limit, exclusion or supplier flag is used.

No cell is chosen by looking at heights, slope, supplier codes, height RMS or LOLA returns.

## Output on the two lunar crops (from running the code, 6 Nov 2026)

| Case | Crop (W × H) | Start (row, col) | Goal (row, col) | Route cells |
|---|---|---|---|---|
| Connecting Ridge | 256 × 256 | 128, 2 | 128, 253 | 252 |
| Nassau | 256 × 256 | 128, 2 | 128, 253 | 252 |

## Why a transect (decision record)

An earlier proposal (5 Nov) used the editor's A* with density 1 + slope / 90°. On both crops it produced exactly this straight midline, so the cost constants had no effect on the route. The authors chose to define the route directly, which keeps our cost model out of the paper (ground rule 4).

## Wording for the paper (proposal for step 9.4)

"To show how evidence reaches a route, the paper configuration displays one illustrative transect: the cells of the crop's middle row with a slope result. The transect is fixed by this rule, not planned, and makes no claim about where a rover should drive."
