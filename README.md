# binget-pkgs

The central declarative package registry for `binget`.

## Structure

Packages are structured in a hierarchical folder layout designed for quick lookup without needing an overarching index.

The format is:
`/<first_letter_of_id>/<id>/<version>/`

Example:
```
/b/bun/1.0.0/manifest.yaml
/b/bun/1.0.0/manifest.linux.amd64.yaml
/b/bun/1.0.0/manifest.windows.amd64.yaml
```

When a user runs `binget install bun@1.0.0`, `binget` will fetch `https://raw.githubusercontent.com/frostyeti/binget-pkgs/master/b/bun/1.0.0/manifest.yaml`.

## Branching Strategy
- `master`: The default branch that the CLI targets.
- `dev`: The prototyping branch for trying out new schemas, workflows, and automated cron update scripts.

(See `docs/DESIGN.md` for full schema details, cron automation plans, and complex runtime integrations).
