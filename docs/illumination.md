# Nassau illumination: separate, dated example

**LROC · Nassau illumination · 3–4 Oct 2026** is an additional delivery using the same native 50 × 50 Nassau height crop and raw published quality flags. **LROC · Nassau · 4 m** retains only slope and roughness. LunarBlock and controlled examples also retain their original two-criterion graphs; they continue to demonstrate declared interpolation. No terrain values or quality flags are changed to create the illumination example.

## Real Sun positions and fixed rendering

The period is **2026-10-03 12:00 UTC to 2026-10-04 12:00 UTC**. Twenty-four equal one-hour bins use NASA/JPL Horizons positions at their midpoints (12:30 through 11:30 the next day). This sunrise interval was selected to show terrain-dependent visibility, rather than a wholly daylight/night interval. The trajectory is an ephemeris calculation, not a measurement or an illustrative angular sweep.

The observing site is the crop centre, **178.990728220° east, −21.591941222° latitude**, at the crop's mean delivered elevation, approximately −0.584432 km relative to the 1,737.4 km sphere. Coordinates come from the source equirectangular grid, including the full-raster crop offsets and pixel-area centre convention. Longitude uses the −22° standard parallel; northing converts to latitude using the reference radius. Local east distances are corrected by cos(latitude)/cos(standard parallel); north distances retain the source spacing. A single crop-centre Sun direction is used across this 200 m crop.

The archived response specifies Sun target 10, lunar surface observer `coord@301`, `MEAN_ME (high precision)`, DE441, quantity 4 (airless apparent azimuth/elevation). Azimuth is clockwise from north. [JPL Horizons manual](https://ssd.jpl.nasa.gov/horizons/manual.html), [API specification](https://ssd-api.jpl.nasa.gov/doc/horizons.html). The LROC RDR coordinate convention is mean Earth/polar axis, planetocentric latitude and east-positive longitude. On the spherical lunar reference, planetocentric and planetodetic latitudes coincide. [LROC RDR SIS](https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001/DOCUMENT/RDRSIS.PDF). No sub-metre frame alignment between the source mapping realization and the newer Horizons lunar orientation is claimed.

The preview is permanently rendered at **2026-10-04 00:30 UTC**, azimuth **89.889841°**, elevation **3.144765°**, native vertical scale ×1, with a fixed orthographic camera. It includes local cast-shadow tests and surface shading; image intensity is not calibrated radiance. There is no free Sun slider or playback. The inspector can select only an archived timestamp; this never changes the fixed preview. The timeline reports the entire period and highlights the inspected sample; the preview illustrates one explicitly labelled instant. These are different outputs, not interchangeable sunlight estimates.

## Reproducibility

- `fixtures/illumination/nassau-sun-horizons.json`: complete original Horizons response.
- `fixtures/illumination/nassau-sun-period.json`: exact request URL, response SHA-256, coordinates, UTC interval, samples, fixed preview instant and metric.
- `src/fixtures/lunar-sun-data.js`: generated offline browser fixture. No runtime network request.
- `tools/prepare-lunar-sun.py`: reconstructs the fixture from the archived response; `--download` explicitly fetches it again. Response hashes can differ on re-fetch because Horizons includes a generation timestamp.
- `tools/generate-illumination-preview.py`: renders the fixed preview from these same heights and the archived fixed Sun position.

Run from the repository root:

```sh
python3 prototype/tools/prepare-lunar-sun.py
MPLCONFIGDIR=/tmp/hallmark-matplotlib python3 prototype/tools/generate-illumination-preview.py
node prototype/tools/build-standalone.mjs
```

## Terrain model and boundaries

For each analysed cell and positive-elevation Sun sample, rays traverse to the crop edge at half nominal-cell increments, retaining each unique nearest grid post visited. Every visited height's angle above the target is compared with solar elevation. Equality is blocked. The full ray is read, so support includes every tested post, not only the highest obstacle. Original delivered heights are used directly, independently of slope and roughness.

The result is the weighted percentage of hourly samples with direct-Sun visibility **within the crop**. It is not a continuous-time duration, irradiance or an operational illumination forecast. Distant terrain, lunar curvature across the crop, finite solar-disc visibility, eclipses and sub-grid relief are excluded. The model does not establish that terrain outside the crop cannot cast shadows. The one-hour interval limits temporal resolution; neither the source DEM nor this model is certified by the ephemeris accuracy.

## Missing data and separate evidence

A below-horizon Sun requires no terrain inputs. For a positive-elevation Sun, a known blocker with a known target establishes shadow despite other missing posts. Without a known blocker, missing tested heights leave the sample unknown. Unknown samples remain in the denominator, with lower/upper fractions and no single percentage until resolved. Those bounds describe missing data, not confidence intervals.

Every sample retains original indices, UTC and Sun angles, visibility status, missing heights, declared interpolation count and published suspicious count. An unavailable production history is null, not zero interpolation. In this LROC example, suspicious code 3 is counted separately and per-height filling history remains unavailable. Successful correlation never becomes “observed”; suspicious never becomes “interpolated.” Counts identify computations that read flagged inputs, not proof that those flags changed the outcome.

The period support is the deduplicated union of sampled rays. Only this additional example's Combined assessment includes the illumination branch. The editable minimum sunlight threshold defaults to 50%; it is illustrative, not an operational requirement. Equality meets the minimum.

The core retains an explicit illustrative schedule for analytical/backward-compatible API tests, but no shipped delivery silently evaluates it. `evaluate(dataset)` chooses a two-criterion pipeline unless the dataset explicitly supplies `illuminationPeriod`. `createPipeline()` remains the complete operation catalog; `createDatasetPipeline(dataset)` is the delivery-specific graph.

## Interface and checks

At the Illumination value step, the calculated period result appears on the left and its propagated evidence result on the right. At the illumination criterion, that evidence appears on the left and the criterion result on the right. Both panes share selection. Criteria retain Trace to heights. The timestamp selector inspects an archived hourly calculation. The supporting-height grid in the inspector shows that sample’s exact tested posts, with an arrow toward the Sun. A side-by-side terrain profile plots relative height against distance and the Sun sight line; black-outlined posts block sunlight. Night samples show no terrain inputs. The outcome states the sample’s contribution to the period total. Choosing All samples returns the union of period dependencies. Both result and propagated-evidence layers remain period summaries during timestamp inspection; they mark only the selected result cell. The source footprints remain in the inspector. Individual timestamp dependencies also remain in Full record. The preview is lazy-loaded and fixed. The original Nassau graph has six nodes; the dated example has eight. Automated checks cover source hashes, exact archived angles and timestamps, coordinate conversion, unchanged original records, separate evidence counts, recorded-time controls without arbitrary Sun changes, analytical ray behaviour, source tracing and shared map selection. Browser layout requires separate visual verification.

The profile is generated on demand by `illuminationTrace(ev, cell, sampleIndex)` from evaluated source-height records and the same directional geometry as the calculation. Missing points break the terrain line; they are never interpolated for display. Production history and quality counts remain separate. Profile interpolation lines are visual connections between tested posts, not new sampled heights. The two inspector graphics share the existing source area rather than adding another permanent panel.
