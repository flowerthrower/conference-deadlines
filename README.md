# Conference Deadlines

Public, read-only calendar of recurring conference submission deadlines.

## Subscribe

Subscribe to this URL rather than importing it once:

```text
https://flowerthrower.github.io/conference-deadlines/calendar.ics
```

## Maintain

`conferences.yaml` is the conference source of truth. One entry looks like this:

```yaml
- id: qce
  community: Quantum Computing
  name: QCE
  aliases: [IEEE Quantum Week]
  monitored_submissions:
    - technical paper
    - workshop proposal
    - workshop paper
    - tutorial proposal
    - panel proposal
    - poster
  official_sources:
    - url: https://qce.quantum.ieee.org/2026/news-and-updates/
      title: Official IEEE Quantum Week site
      status: 2027 deadlines not announced
  last_checked: "2026-08-18T11:49:39Z"
```

Deadlines live in `data/deadlines.json`.

- Include recurring main conferences only. Track workshop deadlines under their parent conference.
- Set `all_day` to `true`; the exact cutoff remains in `deadline_at`.
- Use `23:59` AoE (`UTC-12`) when an official source provides a date without a time.
- Increment `sequence` when an existing event changes.
- Base placeholders only on official previous-edition dates. Keep their IDs when replacing them with confirmed dates.
- Confirm dates only from official conference sources.

After editing:

```sh
npm ci
npm run generate
npm run validate
```
