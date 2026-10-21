# Local schema compatibility fixture

`object_info.local-trimmed.json` retains only the eleven live node definitions
used by the three builtin recipes or the mtb boolean-COMBO regression. The two
`Fixture*` definitions are deliberately synthetic unsupported schemas. Source
and fixture SHA-256 hashes are recorded in the sibling provenance JSON.

The source was a read-only snapshot of the user's already-running local
ComfyUI. Descriptions, hidden inputs, and all string defaults were removed to
avoid copying unrelated data or credential-bearing defaults. Model option
lists are historical schema data, not a promise that weights are still present.
These tests neither load models nor submit inference.

`normalizeObjectInfo` remains strict for existing callers. Main analysis opts
into `normalizeObjectInfoWithDiagnostics` to isolate unsupported **schemas** at
their owning input/node, following the planner's compatibility decision. This
is a security convergence, not a relaxation of the global JSON boundary:
forbidden keys, cycles, non-finite values, and JSON depth/size limits still
throw before recovery, including on analysis-cache hits. A related unsupported
required/provided input or node blocks the current graph; unrelated definitions
only produce bounded, shape-only environment diagnostics.
