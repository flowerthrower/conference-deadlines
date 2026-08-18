import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const conferences = JSON.parse(await readFile(new URL("data/conferences.json", root), "utf8"));
const deadlines = JSON.parse(await readFile(new URL("data/deadlines.json", root), "utf8"));
const calendar = await readFile(new URL("calendar.ics", root), "utf8");

const conferenceIds = conferences.conferences.map((conference) => conference.id);
if (conferenceIds.length !== new Set(conferenceIds).size) throw new Error("Duplicate conference IDs");

const deadlineIds = deadlines.deadlines.map((deadline) => deadline.id);
if (deadlineIds.length !== new Set(deadlineIds).size) throw new Error("Duplicate deadline IDs");

for (const deadline of deadlines.deadlines) {
  if (!conferenceIds.includes(deadline.conference_id)) {
    throw new Error(`Unknown conference_id: ${deadline.conference_id}`);
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

console.log(`Validated ${conferenceIds.length} conferences and ${deadlineIds.length} deadline(s).`);
