# Conference Deadlines

Public, read-only calendar of recurring conference submission deadlines.

## Subscribe

Subscribe to this URL rather than importing it once:

```text
https://flowerthrower.github.io/conference-deadlines/calendar.ics
```

## Maintain

Edit only `conferences.yaml`. A conference entry looks like this:

```yaml
- id: qce
  community: Quantum Computing
  name: QCE
  edition: "2027"
  calendar_name: IEEE Quantum Week
  aliases: [IEEE Quantum Week]
  monitored_submissions:
    technical-paper: Technical paper
    workshop-proposal: Workshop proposal
    poster: Poster
  official_sources:
    - id: official
      url: https://qce.quantum.ieee.org/2026/news-and-updates/
      title: Official IEEE Quantum Week site
      edition: "2026"
      status: discover
      covers: all
      verified_at: 2026-08-18T11:49:39Z
    - id: deadline-1
      url: https://qce.quantum.ieee.org/2026/submission-deadlines/
      title: Official IEEE Quantum Week 2026 submission deadlines
      edition: "2026"
      status: historical
      covers: [technical-paper]
      verified_at: 2026-08-18T13:06:25Z
```

A deadline refers to those stable IDs:

```yaml
- id: qce-2027-technical-paper
  conference: qce
  edition: "2027"
  submissions: [technical-paper]
  deadline_at: 2027-04-27T23:59:00-12:00
  timezone: AoE (UTC-12)
  source: deadline-1
  placeholder:
    based_on_edition: "2026"
    based_on_deadline_at: 2026-04-27T23:59:00-12:00
```

Source `status` is `current`, `discover`, or `historical`; `covers` is `all` or a list of submission IDs.

- Include recurring main conferences only. Track workshop deadlines under their parent conference.
- Use `23:59` AoE (`UTC-12`) when an official source provides a date without a time.
- Increment `sequence` when an existing event changes.
- Base placeholders only on official previous-edition dates. Keep their IDs when replacing them with confirmed dates.
- Confirm dates only from official conference sources.

Setup once, then rebuild after edits:

```sh
npm ci
npm run build
npm run check
```

`npm run plan` prints only the official sources due for this week's review.
