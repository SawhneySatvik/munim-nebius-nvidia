# Munim hackathon film: storyboard and evidence notes

The submission cut is specified in [`video/munim-launch/script/nebius.md`](../../video/munim-launch/script/nebius.md) and timed by `video/munim-launch/assets/js/timing-nebius.js`. Target duration is 169 seconds (2:49). It devotes 39 seconds to AI back-office routing and role-based model use, and 35 seconds to the supply graph, within the under-three-minute limit.

## Narrative

The film follows one owner problem from her morning brief to the evidence behind a business signal. It then shows how Munim routes work across its AI back office, where Nemotron models fit, how a constrained supplier workflow produces a human-reviewed draft, and how the connected supply graph explains downstream impact. It closes on an abstention example to show that missing evidence becomes “Cannot verify.”

## Evidence and wording rules

- The project owner confirms successful live application inference through Nebius Token Factory using configured NVIDIA Nemotron model roles.
- The configured Token Factory role IDs are listed in `scripts/dev/nemotron-roles.ts`. The film can show role names/IDs, but must not imply that every role was separately benchmarked on Token Factory unless a run trace supports that claim.
- Screens captured from the earlier NVIDIA endpoint must keep their source attribution. Do not describe those captures or measurements as Token Factory performance results.
- Business data and invoices are synthetic. Supplier agents and Cares recipients are simulated. Payments are recorded, not processed.
- The approval sequence must be captured from a real completed application flow, or clearly shown as a draft awaiting a person. Never fabricate an approval state or audit entry.
- The graph sequence builds the visible supplier/ingredient/dish/outlet path and returns to the graph-backed answer. State a specific graph database backend only after confirming that deployment's configuration.

## Scene sources

| Story beat | Composition | Source/behavior |
|---|---|---|
| Morning and cited Ask | `scenes/n1-morning.html` | Captured application screens from `assets/screens/nebius/`; source drawer and finding. |
| AI office | `scenes/06-office.html` | Office, watcher sweep, Ask answer and abstention replay using shared product UI components. |
| Nebius/Nemotron roles | `scenes/n2-models.html` | Task examples and role map; model role IDs from `scripts/dev/nemotron-roles.ts`. |
| Quote negotiation | `scenes/n4-quotes.html` | Three simulated suppliers and policy-limited deal review. |
| Draft and approval gate | `scenes/n5-order.html` | Purchase-order proposal and human decision flow. Capture the final approval state from the application before claiming approval. |
| Supply graph | `scenes/07b-graph.html` | Graph constructs, traces a price impact, opens supplier map and asks a graph-backed question. |
| Abstention and close | `scenes/n6-verify.html`, `scenes/n8-end.html` | “Cannot verify” and final disclosure. |

## Release checklist

1. Regenerate changed narration and music using the clock; preserve line-to-caption parity.
2. Render with the pinned HyperFrames CLI and inspect the rendered film, not only the storyboard.
3. Confirm the final duration is under 180 seconds and the frame/audio format is correct.
4. Inspect every scene, transition and on-screen model/source label. Keep synthetic/simulated and payment disclosures visible.
5. Confirm model/provider claims against run evidence and the configured role IDs.
6. Replace the final demo URL and YouTube URL after deployment/public upload; leave no other placeholders.
