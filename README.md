# Conference Deadlines

Public, read-only submission deadline calendar with official-source provenance.

## Subscribe

After GitHub Pages is enabled, subscribe to:

`https://flowerthrower.github.io/conference-deadlines/calendar.ics`

## Source policy

- Rough windows in `data/conferences.json` are discovery hints, never published deadlines.
- A deadline enters `data/deadlines.json` only when an official conference source provides an exact date.
- Separate submission types receive separate events.
- Event IDs remain stable when dates move; `SEQUENCE` increases so calendar clients update instead of duplicating.
- Conflicting official sources are flagged for review rather than guessed.
- Superseded dates are retained in `data/history.json`.

## Data format

Each verified deadline contains a stable `id`, conference edition, submission type, exact timestamp or all-day date, official timezone, source URL, verification time, and sequence number.

## Rebuild and validate

Run the maintained VS Code task **Validate calendar feed**. It regenerates `calendar.ics` and checks the registry and feed structure.
