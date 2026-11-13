# GBS Change Intelligence — Change Management Studio

From Change Assessment to Actionable Communication.

A React + TypeScript workbench that turns GBS/GCC change inputs into an explainable stakeholder impact assessment, milestone-driven audience, communicator, and channel matrices, a master communication plan, and editable Word, Excel, and PowerPoint deliverables.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # engine + export tests (vitest)
npm run build      # production build to dist/
npm run build:single   # one self-contained HTML file in dist-single/ (used for the hosted artifact)
```

Standalone, data is saved in the browser (IndexedDB). As a claude.ai artifact, data is saved to the artifact's private per-user storage and files download through the viewer's save prompt.

## Architecture

| Layer | Location |
|---|---|
| Domain model (single source of truth) | `src/domain/types.ts`, libraries in `library.ts`, demo in `demo.ts`, migrations in `migrate.ts` |
| GBS Change Library (125 templates, data only) | `src/catalogue/templates.ts`, relationship profiles `profiles.ts`, questions `questions.ts` |
| Template resolution, versions, import matching | `src/catalogue/registry.ts`, `instance.ts` |
| Template-driven stakeholder relationships | `src/engine/templateImpact.ts` |
| Impact engine (change-level assessment → matrix aggregation) | `src/engine/impact.ts` |
| Audience engine | `src/engine/audience.ts` |
| Communicator engine | `src/engine/communicator.ts` |
| Channel engine | `src/engine/channel.ts` |
| Messaging engine | `src/engine/messaging.ts` |
| Artifact engine (15 templates) | `src/engine/artifacts.ts`, `artifactMeta.ts` |
| Derivation, staleness, and validation | `src/engine/derive.ts` |
| State, undo, audit, persistence | `src/store/` (change selection in `changeActions.ts`), `src/services/persistence.ts` |
| Exports (DOCX / XLSX / PPTX) | `src/services/docx.ts`, `office.ts` |
| UI | `src/App.tsx`, `src/modules/*`, `src/ui/*` |

Recommendations are computed live from the canonical records. Only consultant decisions are stored (impact decisions, role, channel, and message overrides, statuses), so every matrix stays consistent. Overrides are never replaced silently: when the live recommendation diverges, the conflict is flagged.

The AI integration boundary is the messaging and artifact engines. No external model is connected, and the UI does not present any content as AI-generated.

## Change Identification

Consultants tick changes from the GBS Change Library (125 templates across Operating Model, Process, Organization Structure, Technology, and Interaction Model, tagged by function and process). Each tick creates an engagement-specific Change Register record that references `templateId` + `templateVersion`; the shared template is never modified by engagement work.

Each template carries stakeholder relationship rules (direct impact, indirect impact, governance, awareness), optionally conditional on clarification answers. The impact engine evaluates every stakeholder × selected change, then aggregates into the stakeholder × dimension matrix. Governance and awareness relationships are not impacts; they feed audience planning. Unanswered impact-relevant questions produce "Requires review", never a guessed impact.

Deselecting a change keeps its record (inactive), answers, and decisions. Consultant decisions at cell or change level are never overwritten; conflicts are flagged. Library edits are saved as new versions, and engagements keep their version until updated.

End-to-end check: `npm run build && npm run preview`, then `node e2e/change-identification.e2e.cjs`.
