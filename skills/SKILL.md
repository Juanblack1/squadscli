---
name: software-factory-cli
description: >
  Agent-native CLI to run the Software Factory squad with staged workflows,
  multi-provider execution, provider/model selection, review rounds, and
  release-oriented artifacts.
---

# software-factory-cli

Use this CLI when you need to run the `software-factory` squad from a terminal or another agent-capable application.

## Core commands

- `software-factory providers`
- `software-factory models`
- `software-factory doctor --provider <provider>`
- `software-factory create-prd --name <workflow> --brief "..." --provider <provider> --model <model>`
- `software-factory create-techspec --name <workflow> --brief "..." --provider <provider> --model <model>`
- `software-factory create-tasks --name <workflow> --brief "..." --provider <provider> --model <model>`
- `software-factory run --name <workflow> --brief "..." --provider <provider> --model <model>`

## Good usage pattern

1. Run `providers` to see what is installed and ready.
2. Run `models` to see the active or suggested model per provider.
3. Run `doctor` for the exact provider you want.
4. Prefer staged execution for lower token usage: `create-prd` -> `create-techspec` -> `create-tasks`.
5. Use `run` for the full flow only when the workflow already has enough context.

## Important rules

- The UX path must respect Pencil before frontend.
- Real image generation should use Gemini Imagen.
- Existing workflow artifacts should be evolved, not contradicted.
- If blocking ambiguity remains, ask a short question instead of guessing.
