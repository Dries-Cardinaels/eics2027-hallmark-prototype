# Inspecting a proposed rover path

The supervisor selects a start and destination, chooses a planning branch and flag switches, inspects a proposed route, revises it and locally approves the current revision. **Focus ↗** frames the current and previous routes. The centreline describes native route cells, not a rover footprint or swept vehicle width. The prototype does not incorporate vehicle geometry, traction, stopping distance, communications, illumination or execution.

## Planning branch and inspection

Explicit selections in the map menu or pipeline set the **Planning** branch shown beside the route. The two source views, Terrain and Quality, select Heights. The Flagged input fraction layer is auxiliary combined-support evidence and preserves the existing planning branch. Tracing an input, returning through the inspection trail, selecting a route cell, hovering and inspecting Height here also preserve it. The URL stores `branch` separately from the inspected `map`; old URLs infer a branch from their map.

The active branch determines both available cells and the terrain tie cost:

| Planning branch | Required inputs | Local terrain density |
| --- | --- | --- |
| Heights | Supplied height at the native cell | 1; minimize ground distance |
| Slope | Available slope, with its eight declared heights | 1 + slope / 90° |
| Slope limit | Slope and its own limit check | 1 + slope / 90° + 8 if that check exceeds |
| Roughness | Available roughness, with its 25 declared heights | 1 + roughness / 1 m |
| Roughness limit | Roughness and its own limit check | 1 + roughness / 1 m + 8 if that check exceeds |
| Assessment or Traversal cost | Both values and both checks | 1 + slope / 90° + roughness / 1 m + 8 per exceeded check |

Raw value branches do not apply threshold penalties. Missing downstream roughness cannot block a valid Heights or Slope route. Derived branches retain the canonical two-cell analysis margin. Heights can use the full source grid, including its edges, and only missing heights or explicit exclusions block it. All endpoints, exclusions and route vertices use native source row/column addresses.

## Two route objectives

When a relevant switch is on and its quality evidence is supplied, the planner first minimizes **matching native route cells**, then minimizes the active branch's terrain cost. This is a lexicographic ordering, not a numerical quality penalty. A route with fewer matches wins regardless of its larger terrain cost. Equal match counts are resolved by terrain cost.

- **Height flags** matches a route cell's own supplied suspicious height category.
- **Affected results** matches a route cell whose active planning branch uses at least one supplied suspicious height. Horn slope uses eight neighbours and excludes its centre; roughness uses all 25 heights. Assessment and Traversal cost use the unique combined union.
- With both on, a cell matching either source counts once. With both off, planning uses terrain cost alone. Heights ignores Affected results; its remembered setting applies again when a derived branch is selected.

Counts include start and goal. A single-cell route has zero ground distance and terrain cost, and contributes one match if that cell matches. Flags remain reconstruction categories, not probabilities. Missing quality is unknown rather than supplied zero: the route reports unknown matching evidence and uses terrain-only ordering. Blocked cells with unknown evidence do not disable a known matching objective on traversable cells.

For adjacent native cells, terrain step cost is `native spacing / 1 m × mean(endpoint densities)`. Route terrain cost sums those steps. With Heights' unit density this is exactly ground distance, reported in metres. Other branches use dimensionless weighted distance. Only active limit checks add +8; exceeded checks remain traversable, equality stays within the limit, and zero limits are valid.

The Traversal cost map and contribution table retain the full terrain arithmetic and exact source union. Their colours show the terrain tie cost, while selected-cell matching is shown separately. Flagged input fraction counts suspicious / total unique combined height inputs and traces those heights directly; the fraction itself is not a cost contribution.

## Revision, approval and export

**Set start** and **Set goal** enable explicit picking on terrain or locator; Cancel or Escape exits it. Suggested endpoints stay near the crop's worked location. **Plan** calculates a proposal; **Replan** calculates a new revision. A current proposal starts in **Needs review**. **Approve** records local review of that route ID and revision and sends no motion command.

An explicit planning-branch or flag-switch change automatically replans an existing proposal, retains its prior geometry and original configuration, clears stale path selection/trace and invalidates approval. Selecting the same branch changes nothing. If there is no current proposal, configuration edits leave Draft until Plan. Endpoint and exclusion edits, or a limit used by the active criterion branch, clear the proposal for manual replanning. Inactive limit edits refresh fields for later inspection and branch changes without invalidating the current route or approval.

**Exclude row, col** blocks the selected native cell. Clear removes all exclusions. Missing required inputs and disconnected searches leave an explicit error, no current route and approval disabled. Repeated Draft edits and failed searches retain the same previous successful plan. A direct Replan also retains its current route as previous. A dataset or surface change resets route history and approval.

Export separates `supervisoryPlan.current` and `.previous`. Both retain dataset identity, endpoints, exclusions, original limits, planning branch, flag settings, revision, ordered route, objective order, matching count, terrain cost and exact-route approval. The previous plan is historical; its approval never approves a new revision. A Draft or failed plan exports no current route or approval. Exported snapshots are independent copies. The selected Hallmark query and source evidence remain independently available.

## Comparing routes and reading evidence

Previous and Proposed are both evaluated under the **current** planning branch, switches and active limits. Comparison reports matching-cell count when relevant, terrain cost or ground distance, and only active criterion exceedance counts. Historical original configurations remain in the plan export. A previous geometry crossing unavailable cells of the new branch reports unavailable current cost. Counts refer to native route cells, never sums of overlapping input footprints. Unknown quality reads Not supplied. Identical ordered routes say Route unchanged; reversed geometry says Same path geometry.

The strip follows the planning branch: Heights shows supplied heights, raw value branches show their own values, criterion branches show their own checks, and Assessment/Traversal cost retain both checks. Its matching-cell track and route ! markers follow the current planning rule independently of the inspected display branch. Terrain and Quality route patches use neutral source colours, so Heights does not look assessed by downstream limits. Raw Slope/Roughness retain numeric colours; criterion maps retain categorical check colours. Both flags off hides quality details except in explicitly selected quality views.

Only the current proposal is selectable. Its opaque pastel native-cell patches follow the delivered terrain and retain strong borders and a solid white centreline. Previous geometry remains subdued dashed slate context; coincident history is suppressed. S/G markers identify endpoints, and dashed peach cells identify exclusions. Each result/source footprint spans the same native square; zoom and surface-conformance drawing add no measurements.

During exact input tracing, route cells outside the queried source footprint remain legible context with a dark centreline and pale halo. Exact height inputs retain stronger blue outlines, with suspicious actual inputs controlled by Height flags. Affected results marks the displayed result's declared inputs; this inspected overlay can differ from the persistent planning branch. The selected-cell card explicitly names that planning branch and separates its matching status from terrain density or ground spacing.

Height here exposes the supplied centre status separately from the result's input flags. An excluded Horn centre remains inspectable context and is never added to its eight inputs. At native height (120,127), supplied code 3 is suspicious: slope has 0/8 suspicious inputs while roughness includes the centre and has 1/25. At the Nassau worked address (128,128), Horn slope is 14.99246742611901° with seven suspicious inputs and roughness is 1.3306790513477074 m with 15/25. Original per-cell history and calibrated uncertainty are unavailable.

## Search and verification

A* reads compact canonical arrays without allocating provenance records per cell. Its queue orders matching count, terrain estimate, remaining Manhattan terrain heuristic and native row-major index. The matching heuristic is zero; terrain's heuristic is Manhattan distance × native spacing / 1 m × the unit baseline. Nonnegative matching increments and terrain densities of at least one make these heuristics consistent. Four orthogonal centre-to-centre steps touch exactly the ordered A* cells. Positive terrain steps eliminate beneficial cycles.

Tests compare all seven branches and four flag modes against an independent lexicographic Dijkstra implementation, including missing fields, exclusions, spacing, endpoint matches, unavoidable matches, expensive detours, terrain ties, unknown quality, exact source support, branch-local approval invalidation and historical comparison. Older internal API calls that omit branch/settings retain full-terrain planning with both flag selections off.
