# Conference Deadlines

Public, read-only submission deadline calendar with official-source provenance.

## Subscribe

After GitHub Pages is enabled, subscribe to:

`https://flowerthrower.github.io/conference-deadlines/calendar.ics`

## Source policy

- `conferences.yaml` is the single maintained conference registry.
- Each conference lists the submission types to monitor in `monitored_submissions`.
- Discovery windows in `conferences.yaml` are search hints, never published deadlines.
- A deadline enters `data/deadlines.json` only when an official conference source provides an exact date.
- When an official source gives a date but no time, the deadline is recorded as 23:59 Anywhere on Earth (`UTC-12`).
- Calendar deadlines are published as full-day events on the conference's stated deadline date.
- AoE event descriptions explain that the cutoff is 14:00 on the following day in Central European summer time (CEST, UTC+2), or 13:00 in winter (CET, UTC+1).
- Separate submission types receive separate events.
- Event IDs remain stable when dates move; `SEQUENCE` increases so calendar clients update instead of duplicating.
- Conflicting official sources are flagged for review rather than guessed.
- Superseded dates are retained in `data/history.json`.

## Data format

Each verified deadline contains a stable `id`, conference edition, submission type, exact cutoff, timezone, source URL, verification time, and sequence number. The exact cutoff remains in the data even though the calendar event is full-day.

`data/conferences.json` is generated for the website. Do not edit it directly.

## Rebuild and validate

Run the maintained VS Code task **Validate calendar feed**. It installs dependencies using a repository-local cache, regenerates the website data and `calendar.ics`, then checks the registry and feed structure.
