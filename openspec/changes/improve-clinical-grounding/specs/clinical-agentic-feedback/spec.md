## MODIFIED Requirements

### Requirement: Structured activity presentation
The system SHALL classify model-tool execution through one runtime-owned `TOOL_PRESENTATION_POLICY` using finite classes `silent`, `progress`, `artifact`, and `human_gate`; `background` SHALL describe existing non-tool domain lifecycle. Quiet behavior SHALL mean the mapped class is `silent`; no separate quiet-tool set or label/output inference SHALL exist. It SHALL render visible clinical activity as compact unboxed items driven by structured status and domain-semantic labels, SHALL NOT infer progress from labels, and SHALL NOT expose raw tool names, arguments, provider operations, loop iterations, percentages without measured progress, or hidden reasoning. The V1 policy SHALL map `lookup_dental_terms` to `silent`, `get_recent_evolutions` to `progress`, `create_evolution_draft` and `update_evolution_draft` to `artifact`, and `prepare_evolution_save` to `human_gate`. Existing post-save Drive export SHALL remain secondary `background` domain state outside that model-tool map.

#### Scenario: Silent terminology work executes
- **WHEN** `lookup_dental_terms` starts, succeeds, or returns no authoritative match
- **THEN** no activity row or generic completion message is created, while material ambiguity may use the existing assistant-message path

#### Scenario: Patient history retrieval is perceptible
- **WHEN** `get_recent_evolutions` has actually started and remains pending while the clinician waits
- **THEN** at most one activity uses truthful domain text such as `Revisando antecedentes…` and no raw tool name or fabricated percentage

#### Scenario: Draft work is perceptible
- **WHEN** `create_evolution_draft` or `update_evolution_draft` has actually started and remains pending
- **THEN** compact activity may use `Preparando evolución…` until the artifact is available

#### Scenario: Artifact or gate becomes available
- **WHEN** draft activity produces an artifact or save preparation produces the existing approval gate
- **THEN** artifact or approval becomes primary and completed activity collapses to a compact summary or disappears

#### Scenario: Short response needs no progress chrome
- **WHEN** a turn completes without a perceptible `progress` or `artifact` operation
- **THEN** transcript adds no unnecessary activity card or competing loader

#### Scenario: Activity terminal status renders
- **WHEN** visible activity completes, fails, or is declined before a durable artifact replaces it
- **THEN** its existing structured completion, failure, or neutral-decline icon and tone render without label substring inference

#### Scenario: Drive remains secondary background state
- **WHEN** canonical save is complete and existing Drive export remains pending, syncing, synced, or failed
- **THEN** Drive state remains attached to the clinical artifact and does not become model-tool activity or a contextless toast

### Requirement: Live and hydrated artifacts converge
The transcript SHALL reconstruct the same artifact identity, clinical stage, content, contextual actions, and optional Drive state from live SSE or authoritative persisted thread hydration without persisting a frontend-only view model. Every clinical stream termination path, including clean EOF, abort, component remount, reload, and unexpected reader/network failure, SHALL hydrate existing thread state before declaring failure or offering retry. Subscriber loss SHALL NOT implicitly cancel detached server work.

#### Scenario: Thread refreshes
- **WHEN** a live or completed clinical thread is hydrated
- **THEN** it renders the same single artifact and no duplicate approval or result item

#### Scenario: Stream ends without final event
- **WHEN** SSE closes after the server persisted a message, artifact, action, or terminal outcome but client missed the final event
- **THEN** thread hydration reconstructs persisted state and selects the corresponding existing runtime state

#### Scenario: Reader reports transport failure
- **WHEN** a network or SSE reader error occurs
- **THEN** client first hydrates thread state and renders persisted completion or failure instead of immediately offering duplicate retry

#### Scenario: Persisted turn remains active
- **WHEN** hydration finds the same active turn still running after subscriber loss
- **THEN** existing active-turn polling continues until persisted terminal state becomes available

#### Scenario: Component unmounts during execution
- **WHEN** Clinical Assistant unmounts or its reader aborts without explicit Stop
- **THEN** detached server work continues and later mount or reload reconstructs persisted messages, artifacts, actions, and outcome

#### Scenario: Ephemeral activity is unavailable after hydration
- **WHEN** interruption or reload loses transient activity rows
- **THEN** durable semantic results render coherently without event replay, cursor, heartbeat, persisted activity log, or new runtime state model
