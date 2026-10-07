# Slice7 evidence

Date: 2026-10-07. Tasks: 1.7, 2.7, 3.7. Requirements: W2–W5, W7, W8, W10, N5, T1, T2.

## Implementation

- `toothGeometry.ts` now supplies eight independently drawn lateral and occlusal profiles, crown/pulp paths, anatomical anchors, position widths and primary-molar remapping. Shared transforms keep lateral anatomy in110px, preserve quadrant reflection and place occlusal views separately. FDI and planned markers stay outside anatomical transforms.
- `ToothClinicalLayers` separates pulp, surfaces, patterns and lateral marks from palette artwork. It renders full/partial pulp clipping, red caries, incipient/pigmentation dots, material-colored fillings, sealant outlines, crown/inlay/overlay patterns, solid implant/bridge crowns, fracture/periapical/orthodontic/post/apicoectomy/overfill marks and planned opacity0.7.
- Missing/extraction presentation attenuates natural anatomy without creating a missing finding. Implant and bridge-pontic records suppress natural roots while the inspector retains underlying record identity.
- Variant symbols resolve the server registry's bridge, splint and implant-crown overrides. Palette violet and anatomical pulp blue remain separate. Clinical tokens do not alter Chat or global action colors.
- Cards use a104px minimum grid,6px gaps,72px minimum height,2px borders, selected fill/halo and6px cyan surface-support dots with an accessible description. No saved-use counters appear on cards.
- The collapsed legend has five base groups and Existing/Planned labels. FDI headings, unique aggregate counts and member-linked highlights preserve procedure identity.
- Narrow screens retain both arches in a local scroll region with44px targets. Notes use the retained Slice9 composer in320/384px rails or a right Sheet, with a safe-area-aware floating action. The target Assistant remains in the header, so it does not share the Notes hit area.
- Source150/200ms feedback,1s preview/highlight and1.5s selection pulses have reduced-motion overrides. Active modal presentation suspends tooth inspection.

## Verification

The first rendered eight-profile scaling assertion failed because the model had no applied anatomical scaling. Final rendered chart/diagnosis/treatment and note suites pass. Frontend typecheck, full-src Biome and the full789-test Vitest run passed, including the shared primitive allowlist.

The final owned Docker browser run passed both Slice9 and Slice7 journeys. The Slice7 synthetic fixture contains all twelve findings and observed examples for crown+endo+caries, implant/missing, bridge/pontic, splints, provisional implant crown, post, full/half/two-thirds pulp, overfill, surface materials, sealant, veneer, inlay/overlay and orthodontic/apicoectomy marks.

Assertions verify:

- 32 permanent and20 primary profiles; eight distinct permanent silhouettes.
- Natural-root suppression for implant, pontic and implant crown.
- Collapsed five-group legend, source violet palette (`rgb(167,139,250)`) and separate blue pulp (`rgb(96,165,250)`).
- 1s tool preview without a write; an actual transformed M-surface pointer click commits one14 finding without an intermediate dialog.
- One saved planned procedure rendered at0.7 opacity with P outside anatomical transforms; it is absent again in diagnosis.
- Exact CSS viewport widths and no page-wide horizontal overflow across six sizes.
- Keyboard inspection/close, reduced-motion selection suppression and Notes center hit-test.
- 200% equivalent reflow at720×450 CSS pixels and DPR2, with keyboard note saving and a1440×900 CDP capture.

## Captures

Images were inspected after the final browser run:

- [1440×900 families](evidence/slice7-families-1440.png)
- [1280×800 families](evidence/slice7-families-1280.png)
- [1024×768 families](evidence/slice7-families-1024.png)
- [768×1024 families](evidence/slice7-families-768.png)
- [430×932 families](evidence/slice7-families-430.png)
- [390×844 families](evidence/slice7-families-390.png)
- [Primary dentition](evidence/slice7-primary-390.png)
- [Planned opacity and P](evidence/slice7-planned-marker.png)
- [200% equivalent reflow](evidence/slice7-200-percent-notes.png)

Browser source and reproduction settings are in [Slice9 evidence](slice9-evidence.md). Synthetic IDs and measured colors are attached as `slice7-colors-identities` in the Playwright run. Screenshots prove rendering; the HTTP/real-Postgres assertions prove persistence.

## Evidence limits

Artwork is independently authored; no copied SVG-path or pixel-identical licensed-art claim is made. The zoom proof models desktop200% reflow and pixel density through CDP, not browser-chrome zoom or real phone hardware. Current target fixtures are not an equal-patient pixel comparison with the reference.

Slice8 integration, Slice10 retirement and release gates retain their pending tasks. Historical geometry aliases remain for the later consumer audit. Unrestricted backend validation still has the recorded catalog line-ending failure; this slice does not mark3.9 complete or sync/archive specifications.
