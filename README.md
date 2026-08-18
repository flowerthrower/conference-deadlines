# Conference Deadlines

Public, read-only calendar of recurring conference submission deadlines with official-source provenance.

- [Browse the calendar](https://flowerthrower.github.io/conference-deadlines/)
- [Calendar feed](https://flowerthrower.github.io/conference-deadlines/calendar.ics)
- [Deadline data](https://flowerthrower.github.io/conference-deadlines/data/deadlines.json)

## Subscribe

Copy this URL into any calendar application that supports ICS subscriptions:

```text
https://flowerthrower.github.io/conference-deadlines/calendar.ics
```

- Google Calendar: **Other calendars → From URL**
- Outlook: **Add calendar → Subscribe from web**
- Apple Calendar: **File → New Calendar Subscription**

Subscribe instead of importing the file. A subscription receives later deadline corrections and newly added events.

All calendar entries are full-day events. Confirmed dates use their official cutoff internally. Placeholder titles contain `(PLACEHOLDER)` and remain tentative until the upcoming edition publishes its timeline. For AoE deadlines, the event description explains the corresponding cutoff in Central European time.

## Read the data

| File | Purpose | Edit directly? |
| --- | --- | --- |
| `conferences.yaml` | Maintained conference list, submission types, discovery windows, and official sources | Yes |
| `data/deadlines.json` | Confirmed deadlines and sourced placeholders | Yes |
| `data/history.json` | Superseded confirmed deadlines | Yes |
| `data/conferences.json` | Website data generated from `conferences.yaml` | No |
| `calendar.ics` | Generated subscription feed | No |

`conferences.yaml` is the single source of truth for which conferences are monitored. IDs must remain stable because deadline events refer to them.

## Edit a conference

Add or update an entry in `conferences.yaml`:

```yaml
- id: iccad
  community: Design Automation
  name: ICCAD
  aliases: []
  discovery_windows: [mid April]
  monitored_submissions:
    - abstract registration
    - regular paper
    - workshop proposal
  official_sources:
    - url: https://iccad.com/2026
      title: Official ICCAD site
      status: 2027 deadlines not announced
  last_checked: "2026-08-18T11:49:39Z"
```

Include recurring main conferences only. Do not add individual workshops as conference entries; workshop proposal deadlines belong under their parent conference.

## Edit a deadline

Entries in `data/deadlines.json` contain a stable ID, conference ID, edition, submission type, optional concise `content` requirement, exact cutoff, timezone, official source, verification time, and sequence number.

- Set `all_day` to `true`; the exact cutoff remains in `deadline_at`.
- Use `23:59` AoE (`UTC-12`) when an official source provides a date without a time.
- Increment `sequence` when an existing event changes.
- For a placeholder, add `placeholder.based_on_edition` and `placeholder.based_on_deadline_at`, and cite the official previous-edition source.
- When a placeholder becomes confirmed, keep its ID, replace its date and source, remove `placeholder`, and increment `sequence`.

Every generated calendar comment uses this template:

```text
Submission type: Research paper
Content: See the official source for submission requirements.

Official source: https://example.org/
Verified: 2026-08-18T12:14:05Z

Notes: Free-form context, including the AoE conversion when applicable.
```

Never create a confirmed date from a rough discovery window or an unofficial source.

## Generate and validate

VS Code is **not required**. Node.js and npm are sufficient:

```sh
npm ci
npm run generate
npm run validate
```

The generate command rebuilds `data/conferences.json` and `calendar.ics`. Commit maintained and generated files together.

VS Code users may instead run **Terminal → Run Task → Validate calendar feed**, which installs dependencies, generates the feed, and validates it.

## Source policy

- Confirm dates only from official conference sources.
- Use official previous-edition dates for placeholders of the same submission type.
- Keep separate events for separate submission types.
- Preserve moved confirmed dates in `data/history.json`.
- Report conflicting official sources rather than guessing.
