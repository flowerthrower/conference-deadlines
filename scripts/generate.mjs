import { readFile, writeFile } from "node:fs/promises";
import { writeConferenceData } from "./conferences.mjs";

const root = new URL("../", import.meta.url);
const deadlinesPath = new URL("data/deadlines.json", root);
const calendarPath = new URL("calendar.ics", root);
const payload = JSON.parse(await readFile(deadlinesPath, "utf8"));

const conferenceRegistry = await writeConferenceData();
const conferencesById = new Map(conferenceRegistry.conferences.map((conference) => [conference.id, conference]));

function escapeText(value) {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;");
}

function fold(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const chunks = [];
  let current = "";
  let size = 0;
  for (const character of line) {
    const charSize = new TextEncoder().encode(character).length;
    if (size + charSize > 73) {
      chunks.push(current);
      current = character;
      size = charSize;
    } else {
      current += character;
      size += charSize;
    }
  }
  if (current) chunks.push(current);
  return chunks.join("\r\n ");
}

function utcStamp(value) {
  return new Date(value).toISOString().replaceAll("-", "").replaceAll(":", "").replace(".000", "");
}

function dateStamp(value) {
  return value.replaceAll("-", "");
}

function nextDate(value) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function deadlineDate(event) {
  if (!event.deadline_at) throw new Error(`Deadline ${event.id} is missing deadline_at`);
  return event.deadline_at.slice(0, 10);
}

function eventLines(event) {
  const required = ["id", "conference", "edition", "submission_type", "source"];
  for (const field of required) {
    if (!event[field]) throw new Error(`Deadline ${event.id ?? "<unknown>"} is missing ${field}`);
  }
  if (!event.source.url || !event.source.verified_at) {
    throw new Error(`Deadline ${event.id} must include an official source URL and verification time`);
  }
  const conference = conferencesById.get(event.conference_id);
  if (!conference) throw new Error(`Deadline ${event.id} has an unknown conference_id`);

  const isPlaceholder = Boolean(event.placeholder);
  const editionLabel = isPlaceholder ? `${event.edition} (PLACEHOLDER)` : event.edition;

  const lines = [
    "BEGIN:VEVENT",
    `UID:${escapeText(event.id)}@conference-deadlines`,
    `DTSTAMP:${utcStamp(event.source.verified_at)}`,
    `LAST-MODIFIED:${utcStamp(event.source.verified_at)}`,
    `SEQUENCE:${Number(event.sequence ?? 0)}`,
    `SUMMARY:${escapeText(`${event.conference} ${editionLabel} — ${event.submission_type}`)}`,
  ];

  const date = deadlineDate(event);
  lines.push(`DTSTART;VALUE=DATE:${dateStamp(date)}`);
  lines.push(`DTEND;VALUE=DATE:${dateStamp(nextDate(date))}`);

  const aoeNote = event.timezone === "AoE (UTC-12)"
    ? "23:59 AoE means the cutoff is 14:00 on the following day in Central European summer time (CEST, UTC+2), or 13:00 in winter (CET, UTC+1)."
    : null;
  const placeholderNote = isPlaceholder
    ? `PLACEHOLDER: projected from the official ${event.placeholder.based_on_edition} deadline at ${event.placeholder.based_on_deadline_at}; this is not a confirmed ${event.edition} date and the official source below is historical.`
    : null;
  const notes = [placeholderNote, event.notes, aoeNote].filter(Boolean).join(" ") || "No additional notes.";

  const description = [
    `Community: ${conference.community}`,
    `Submission type: ${event.submission_type}`,
    `Content: ${event.content ?? "See the official source for submission requirements."}`,
    "",
    `Notes: ${notes}`,
    "",
    `Official source: ${event.source.url}`,
    `Verified: ${event.source.verified_at}`,
  ].join("\n");

  lines.push(`DESCRIPTION:${escapeText(description)}`);
  lines.push(`URL:${event.source.url}`);
  lines.push("TRANSP:TRANSPARENT");
  lines.push(`STATUS:${isPlaceholder ? "TENTATIVE" : "CONFIRMED"}`);
  lines.push("END:VEVENT");
  return lines;
}

const events = [...payload.deadlines].sort((a, b) => {
  const left = a.deadline_at ?? a.deadline_date;
  const right = b.deadline_at ?? b.deadline_date;
  return left.localeCompare(right);
});

const lines = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Conference Deadlines//Public Feed//EN",
  "CALSCALE:GREGORIAN",
  "METHOD:PUBLISH",
  "X-WR-CALNAME:Conference Deadlines",
  "X-WR-CALDESC:Confirmed and clearly labeled placeholder submission deadlines",
  "REFRESH-INTERVAL;VALUE=DURATION:PT12H",
  "X-PUBLISHED-TTL:PT12H",
  ...events.flatMap(eventLines),
  "END:VCALENDAR",
];

await writeFile(calendarPath, `${lines.map(fold).join("\r\n")}\r\n`, "utf8");
const placeholderCount = events.filter((event) => event.placeholder).length;
console.log(`Generated data for ${conferenceRegistry.conferences.length} conferences and calendar.ics with ${events.length - placeholderCount} confirmed and ${placeholderCount} placeholder deadline(s).`);
