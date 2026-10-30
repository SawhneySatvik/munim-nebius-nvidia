# Munim × Nebius Token Factory × NVIDIA Nemotron — submission cut

**Target length:** 2:49 (169 s), strictly below the three-minute cap. **Structure:** product outcome → AI back office → model routing → evidence-bound purchasing → graph impact → abstention → close. The AI-office passage is about 39 seconds (27 seconds in the product office plus the 12-second role map); the graph passage is 35 seconds and shows the graph forming, tracing a price change, and answering a question.

All business data shown is synthetic. Supplier agents are simulated. Payments are recorded, never processed. The captured application screens retain their provenance labels. Token Factory live application inference is stated as verified by the project owner; the film makes no Token Factory performance benchmark claim.

## Storyboard and narration

| Beat | Time | Screen/action | Narration |
|---|---:|---|---|
| Morning brief and Ask | 0:00–0:26 | Owner home, Ask result, source drawer, waste finding. Tap a source chip and return to the owner context. | Nandini owns two bakeries. Every morning, she has one question. She asks Munim. It answers from her books. Every number is a chip you can open. Tap a number, and see the rows behind it. And Munim found a leak. Butter waste: nearly five thousand rupees, against fifteen hundred. |
| AI back office | 0:26–0:53 | Realistic office replay: the Manager routes to Stock & Purchasing, checks rows, surfaces a finding; Ask streams an answer with source chips and then shows “Cannot verify.” | The AI office routes a question to Stock and Purchasing, then checks the business rows. Rules find the waste signal. The model explains it from cited evidence. Ask Munim, and each number opens its source. Unsupported questions get no guess. |
| Nemotron roles and Token Factory | 0:53–1:05 | Three real captured task examples: route a question, reason over a bounded negotiation, read an invoice image. Overlay configured role IDs/provider attribution; no placeholder pills. | Munim uses NVIDIA Nemotron for routing, reasoning and vision. Nebius Token Factory serves the configured model roles. One model routes; another reasons; a vision model reads structured evidence. |
| Simulated supplier negotiation | 1:05–1:30 | Three labelled simulated suppliers, round-by-round quotes, policy bounds and deterministic deal review. Show why the lowest bid fails minimum order. | Now Munim asks three simulated suppliers. The model writes the notes. Code sets every price it may offer. One quote is cheaper, but the order is too large. It fails the rules. |
| Human-reviewed purchase order | 1:30–1:54 | Sourced purchase-order draft and named approval control. Keep it proposed; do not imply a completed approval or real money movement. | Munim prepares a purchase-order draft. Its saving against the last price paid has a source. The proposal waits for a person. It cannot spend a rupee. The owner can inspect its evidence. Only a person can approve. Core checks authority and the current records. Nothing changes without a person. |
| Supply graph | 1:54–2:29 | The graph builds supplier → ingredient → dish → outlet. Trace a butter price rise to the affected menu and outlets; open the supplier map and impact drawer; ask the graph-backed question and show its source. | The graph builds from suppliers to ingredients, dishes and outlets. Each relationship comes from this business's books. Trace a butter price change through seven dishes and both outlets. The supplier map reveals a single source. Open its impact and inspect each dish margin. Then Ask answers from the connected graph, with source chips. |
| Cannot verify | 2:29–2:42 | Live abstention and a document field held for review. | When the books cannot back a number, Munim does not guess. It says: cannot verify. |
| Close | 2:42–2:49 | Munim mark, configured repository URL, deployment URL placeholder and synthetic-data disclosure. | Munim. The back office that keeps honest books. |

## Build notes

- The graph and office visuals reuse the existing `07b-graph` and `06-office` scene compositions, with the retimed Nebius clock. The graph is a product graph demonstration; the visible graph backend must be named only if the target deployment configuration is confirmed.
- The role card uses the model IDs in `scripts/dev/nemotron-roles.ts`: router `nvidia/Nemotron-3_5-Lightning`, reason `nvidia/nemotron-3-super-120b-a12b`, and extract/vision/narrate `nvidia/Nemotron-3.5-Super-VL`.
- Current captured application images are explicitly attributed as captured runs. Do not present prior NVIDIA-endpoint captures as Token Factory benchmark results.
- The generated root and captions come from `assets/js/timing-nebius.js`; update voice tracks for changed lines before rendering.
- Final delivery still needs the public demo URL and public YouTube URL. The code repository URL is supplied in `docs/nebius/SUBMISSION.md`.
