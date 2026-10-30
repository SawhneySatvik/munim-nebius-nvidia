# Back-office art provenance (template)

Copy to `art/office/PROVENANCE.md` before the first generation. Required by CLAUDE.md hard rule 1 ("fresh
code and original assets created during the official hackathon timeline"; no third-party sprite packs).
Append-only: a replaced asset gets a new row and the old row is marked `superseded by <file>`, never deleted.

Rules for every row:
- **file**: path relative to the repo root. `kind` is one of three values: `drop` for a raw generator output
  (gitignored, so CI cannot check its sha); `processed` for a per-asset file in `art/office/processed/`
  (committed); and `shipped` for the atlas or frame map in `apps/web/public/office/`.
- **sha256**: of the exact bytes (`shasum -a 256 <file>`). A shipped file's sha changes with any edit, so
  re-processing means a new row.
- **prompt id**: as in `ART-DIRECTION.md` §4/§6, text stored verbatim in `art/office/PROMPTS.md`. Use
  `derived` for palette swaps and atlas packing, and name the inputs in `derived from`.
- **model**: the exact model id string the provider returned, plus the provider. `n/a` for derived rows.
  Never a `gemini-2.5-*` id.
- **date**: ISO 8601 with offset, e.g. `2026-10-10T14:05+05:30`. It must fall inside the build window.
- **operator**: a registered team member who ran or approved the generation. An agent may run the call; a
  person signs the row.
- **derived from**: the sha256 values of the drop or input files (comma-separated). Empty only for drops.
- **processing**: the script name and version, plus `hand_edit: yes/no`.

The T-066 gate reads this table. It requires that the `processed` and `shipped` rows equal the files in their
directories (counted from the directories), that their sha values match, that every `derived from` resolves
to a logged row, and that every date is at or after the build start. Drop rows are not verified in CI.

| file | kind | sha256 | prompt id | model | date | operator | derived from | processing | notes |
|---|---|---|---|---|---|---|---|---|---|
| `art/office/drops/A0__P-ANCHOR__r3.png` | drop | `<64 hex>` | P-ANCHOR | `<provider>/<model id>` | `2026-10-__T__:__+05:30` | `<name>` | — | — | anchor, approved by founder |
| `art/office/processed/char-base.png` | processed | `<64 hex>` | P-CHAR-01 | `<provider>/<model id>` | `2026-10-__T__:__+05:30` | `<name>` | `<drop sha>` | `process-office@<ver>`, hand_edit: yes | feet row fixed |
| `apps/web/public/office/atlas.png` | shipped | `<64 hex>` | derived | n/a | `2026-10-__T__:__+05:30` | `<name>` | `<processed sha>, …` | `process-office@<ver>` (pack) | — |
