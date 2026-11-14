# Hallmark: proposed supervisory walkthrough

Captioned explanatory video; data are evaluated by the current prototype, not a screen recording. Limits are illustrative. No operator study is claimed.

## 01 · 00–08 seconds · Read the assessment and its evidence together

LROC Nassau02 · native 4 m posts · demonstration limits: slope 4.5°, roughness 0.5 m.

Start with the configured assessment; keep supporting evidence visible. A met criterion alone is not an approval to proceed.

## 02 · 08–16 seconds · Select one location in either map

Shared selection: height-grid row 19, column 37.

Select a candidate location. Both maps and the inspector refer to the same result location.

## 03 · 16–26 seconds · Inspect the roughness criterion

Use the processing graph to select Roughness criterion.

The criterion is met: 0.315 m ≤ 0.5 m. Its supporting evidence remains attached to that outcome.

## 04 · 26–36 seconds · Read the selected evidence count

One evidence-map cell summarises the inputs for one result.

The selected evidence cell shows 6: six of the 25 supporting heights carry the published suspicious flag.

## 05 · 36–48 seconds · Identify the six original flagged heights

The inspector shows source heights, not neighbouring evidence counts.

These 25 original heights produce the roughness value. Their flags produce the evidence count. The count is not a numerical input.

## 06 · 48–58 seconds · Compare the slope branch at the same location

Select Slope criterion; the location stays fixed.

Slope uses eight neighbours, excluding the centre. Three of those inputs are suspicious; the displayed slope is 3.19°.

## 07 · 58–68 seconds · Return to Combined without losing either branch

Shared source heights are counted once in the combined evidence.

Both criteria are met here. Combined retains six unique suspicious heights—not the sum 3 + 6, because the branches overlap.

## 08 · 68–80 seconds · Keep production history separate from quality

LROC flags and LunarBlock interpolation answer different questions.

Do not convert suspicious into interpolated, or successful correlation into observed. Report the metadata that was actually supplied.

## 09 · 80–90 seconds · Use the evidence to guide review

Hallmark exposes dependencies; a supervisor still judges acceptability.

Review the flagged sources and relevant context before relying on the result. A flag count cannot quantify error or prove a changed outcome.

## 10 · 90–100 seconds · Explain the contribution in the paper

Result → retained evidence → original sources → branch comparison.

Hallmark keeps source evidence attached through calculation, thresholding and combination. This is a proposed supervisory workflow, not a validated planning procedure.

## Suggested paper wording

A supervisor first examines a candidate location in the combined assessment, alongside a map of its retained source evidence. Selecting a criterion reveals its numerical comparison and the original heights supporting it. At the illustrated LROC location, roughness meets the configured 0.5 m limit (0.315 m), while six of its 25 supporting heights carry the published suspicious stereo flag. Inspection of the slope branch exposes a different support set: eight neighbours, three flagged, yielding 3.19° against an illustrative 4.5° limit. The combined record deduplicates shared sources rather than treating the two branches as independent observations. This supports scrutiny of the result’s dependencies; it does not estimate numerical error or establish operational safety.

## Paper alignment notes

The current worked-example.tex still describes a nine-cell declared slope support and a nine-cell verification case. The implemented Horn slope support now excludes the centre and includes eight inputs. Update that passage before claiming the paper describes this exact trace. The paper’s constructed 7.1° example and this LROC example are different cases, not interchangeable measurements. The document has not been edited by this task.

The proposed supervisor sequence is a design rationale, not an empirically validated workflow. Counts measure flagged dependencies, not confidence, equal numerical influence, or probability of error. LROC quality status must not be relabelled as observed/interpolated. LunarBlock is the separate production-history demonstration.
