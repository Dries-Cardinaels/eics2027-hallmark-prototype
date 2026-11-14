# Nassau terrain-belief candidate

A native 50 × 50 crop of the same published Nassau02 DEM and raw CONF.IMG used by the current prototype. This candidate retains the original 4 m grid and float32 values, with no editing or new measurements. It is not registered in the active UI.

The initial heightmap is a terrain belief. Producer flags qualify its evidential basis; successful correlation is not proof of accuracy. Slope and roughness are deterministic transformations of this belief, not independent observations.

At analysis cell (23,23), centred on zero-based product height cell (1336,2088), Horn slope is 14.99246742611901°, with 7 of 8 contributing heights flagged suspicious. Nearby analysis cell (26,19), 20 m away, has slope 14.54415985129793° and 0 of 8 flagged inputs. Both fall below an illustrative 15° limit; neither establishes traversability. The second location is not established as accurate or safer. No per-cell error distribution or confidence interval is supplied.

The local slope range is 3.8456–17.5471°, compared with 0.0610–8.5277° in the active crop. Thus the same illustrative criterion distinguishes terrain here, while the producer flags qualify its inputs. Selection was purposive to illustrate this engineering issue, not representative sampling. The complete selection rule, native coordinates, eight input heights/codes and nearby comparisons are in analysis.json.

Parent raster SHA-256 values were checked against the existing source manifest before extraction. sources.json describes the complete official parent files, not crop files. The parent README is retained for its quality-code semantics and product-wide diagnostics. Diagnostic precision/LOLA residuals must not be interpreted as cell-specific slope uncertainty.
