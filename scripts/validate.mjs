import { readFile } from "node:fs/promises";
import { readConferenceRegistry } from "./conferences.mjs";

const root = new URL("../", import.meta.url);
const conferences = JSON.parse(await readFile(new URL("data/conferences.json", root), "utf8"));
const expectedConferences = await readConferenceRegistry();
const deadlines = JSON.parse(await readFile(new URL("data/deadlines.json", root), "utf8"));
const calendar = await readFile(new URL("calendar.ics", root), "utf8");

if (JSON.stringify(conferences) !== JSON.stringify(expectedConferences)) {
  throw new Error("data/conferences.json is stale; run the generate task");
}

const conferenceIds = conferences.conferences.map((conference) => conference.id);
if (conferenceIds.length !== new Set(conferenceIds).size) throw new Error("Duplicate conference IDs");

for (const conference of conferences.conferences) {
  for (const field of ["id", "community", "name", "last_checked"]) {
    if (!conference[field]) throw new Error(`Conference ${conference.id ?? "<unknown>"} is missing ${field}`);
  }
  for (const field of ["aliases", "rough_deadline_windows", "monitored_submissions", "official_sources"]) {
    if (!Array.isArray(conference[field])) {
      throw new Error(`Conference ${conference.id} must define ${field} as a list`);
    }
  }
  if (!conference.monitored_submissions.length) {
    throw new Error(`Conference ${conference.id} has no monitored submission types`);
  }
  if (!conference.official_sources.length) {
    throw new Error(`Conference ${conference.id} has no official source`);
  }
  for (const source of conference.official_sources) {
    if (!source.url?.startsWith("https://")) {
      throw new Error(`Conference ${conference.id} has a non-HTTPS official source`);
    }
  }
}

const deadlineIds = deadlines.deadlines.map((deadline) => deadline.id);
if (deadlineIds.length !== new Set(deadlineIds).size) throw new Error("Duplicate deadline IDs");

for (const deadline of deadlines.deadlines) {
  if (!conferenceIds.includes(deadline.conference_id)) {
    throw new Error(`Unknown conference_id: ${deadline.conference_id}`);
  }
  if (!deadline.all_day) {
    throw new Error(`Deadline ${deadline.id} must be published as an all-day event`);
  }
  if (!deadline.deadline_at) {
    throw new Error(`Deadline ${deadline.id} must retain its exact cutoff; use 23:59 AoE when no official time is specified`);
  }
  if (!deadline.timezone || deadline.timezone.startsWith("Not specified")) {
    throw new Error(`Deadline ${deadline.id} lacks a timezone`);
  }
  if (!deadline.source?.url?.startsWith("https://")) {
    throw new Error(`Deadline ${deadline.id} lacks an HTTPS official source`);
  }
}

if (!calendar.startsWith("BEGIN:VCALENDAR\r\n")) throw new Error("Invalid calendar header");
if (!calendar.endsWith("END:VCALENDAR\r\n")) throw new Error("Invalid calendar footer");
if ((calendar.match(/BEGIN:VEVENT/g) ?? []).length !== deadlines.deadlines.length) {
  throw new Error("Calendar event count does not match deadlines.json");
}
if ((calendar.match(/DTSTART;VALUE=DATE:/g) ?? []).length !== deadlines.deadlines.length) {
  throw new Error("Every calendar deadline must be an all-day event");
}
if (calendar.includes("\r\nDTSTART:")) {
  throw new Error("Calendar contains a timed deadline event");
}
const unfoldedCalendar = calendar.replaceAll("\r\n ", "");
const aoeDeadlineCount = deadlines.deadlines.filter((deadline) => deadline.timezone === "AoE (UTC-12)").length;
if ((unfoldedCalendar.match(/\\nAoE note:/g) ?? []).length !== aoeDeadlineCount) {
  throw new Error("Every AoE calendar event must explain the Central European cutoff");
}

console.log(`Validated ${conferenceIds.length} conferences and ${deadlineIds.length} deadline(s).`);
