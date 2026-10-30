# Back-office art provenance

Required by CLAUDE.md hard rule 1 (fresh code and original assets only; no third-party sprite packs or art). Append-only:
a replaced asset gets a new row, and the old row is marked `superseded by <file>`.

The staff screens wear Cobnut's look (R53 H-4, R66), so the AI office is drawn as SVG in code, in Cobnut's tokens. It is not
the pixel-art direction in `ART-DIRECTION.md` (D-3), which was written for the old console and was never generated. No model
generated any of it, and nothing was traced or copied: every shape is a primitive (rect, circle, path) typed in the file.
There are no drop or processed files, so the template's raster columns do not apply.

| file | kind | sha256 | prompt id | model | date | operator | derived from | processing | notes |
|---|---|---|---|---|---|---|---|---|---|
| `apps/web/components/staff/office-art.tsx` | code (SVG drawn in code) | n/a (source file; see git history) | none | none | `2026-10-16T12:00+05:30` | T-128 screens lane, for the founder | — | none, hand_edit: yes | Nine specialist desks, the simulated suppliers' bay and the owner's desk. No text or number is drawn. |
| `apps/web/components/icons.tsx` (`PathIcon`) | code (SVG drawn in code) | n/a (source file; see git history) | none | none | `2026-10-16T18:00+05:30` | F3 lane B (T-131), for the founder | — | none, hand_edit: yes | The supplier map's header glyph: a crate, a plate and a shop front on one path (supplier → dish → outlet), five primitives in Cobnut's stroke. No text or number is drawn. |
