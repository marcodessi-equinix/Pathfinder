# Project Guidelines

## Workflow
- Before implementing, understand whether this is a new feature, a new app, or an adaptation of an existing system.
- For new work, first clarify goal, users, scope, and constraints before coding.
- For existing systems, inspect current structure and patterns before editing files.
- Prefer a short implementation plan before multi-file changes.

## Change Quality
- Fix root causes when practical instead of patching symptoms.
- Keep changes as small as possible while still solving the actual problem.
- Preserve existing architectural and styling patterns unless the task explicitly requires a change.
- Verify changed behavior with targeted tests or direct validation steps.

## UI and UX
- Choose an intentional visual direction instead of generic defaults.
- Use a coherent color system, clear type hierarchy, and visible interaction states.
- Treat accessibility and responsive behavior as core requirements, not polish.
- Avoid generic AI-style gradients or arbitrary dark mode unless they fit the product.

## Documentation
- If the project already has decision or notes files, keep them current.
- For larger changes, document important decisions, risks, and next steps succinctly.
