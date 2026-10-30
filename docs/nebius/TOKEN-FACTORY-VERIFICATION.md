# Token Factory live integration verification

**Status: verified by the project owner, 30 October 2026.** The application was tested with the Nebius Token Factory Nemotron model roles listed in `scripts/dev/nemotron-roles.ts`: router `nvidia/Nemotron-3_5-Lightning`, reason `nvidia/nemotron-3-super-120b-a12b`, and extract, vision and narrate `nvidia/Nemotron-3.5-Super-VL`. This establishes that the app's live provider integration was working at test time; it is separate from the recorded fixtures used by automated tests. No per-role performance benchmark is claimed here.

The runtime is configured with `MUNIM_MODEL_MODE=live`, a `nebius` model-role entry, and `NEBIUS_API_KEY`. The provider is implemented in `services/intel/munim_intel/llm/providers.py`; the request path records provider and model identifiers in traces and spend rows.

Performance numbers elsewhere in the submission materials retain their original attribution. Results measured against NVIDIA's `integrate.api.nvidia.com` endpoint are not relabelled as Token Factory benchmarks. This note contains no credentials.
