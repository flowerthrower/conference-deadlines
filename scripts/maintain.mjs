import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { parse } from "yaml";

const root = new URL("../", import.meta.url);
const registryPath = new URL("conferences.yaml", root);
const calendarPath = new URL("calendar.ics", root);
const sourceStates = new Set(["current", "discover", "historical"]);
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const timestampPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(Z|[+-]\d{2}:\d{2})$/;

function fail(message) {
  throw new Error(message);
}

function requireValue(value, message) {
  if (!value) fail(message);
}

function requireTimestamp(value, message) {
  const match = typeof value === "string" ? value.match(timestampPattern) : null;
  if (!match || Number.isNaN(Date.parse(value))) fail(message);
  const [, year, month, day, hour, minute, second, offset] = match;
  const calendarDate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (calendarDate.getUTCFullYear() !== Number(year)
    || calendarDate.getUTCMonth() + 1 !== Number(month)
    || calendarDate.getUTCDate() !== Number(day)
    || Number(hour) > 23
    || Number(minute) > 59
    || Number(second) > 59) {
    fail(message);
  }
  if (offset !== "Z") {
    const [offsetHour, offsetMinute] = offset.slice(1).split(":").map(Number);
    if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) fail(message);
  }
}

function requireHttps(value, message) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") fail(message);
  } catch {
    fail(message);
  }
}

async function readRegistry() {
  const registry = parse(await readFile(registryPath, "utf8"));
  validateRegistry(registry);
  return registry;
}

function validateRegistry(registry) {
  if (registry?.schema_version !== 2) fail("conferences.yaml must use schema_version 2");
  if (!Array.isArray(registry.conferences) || !registry.conferences.length) fail("conferences must be a non-empty list");
  if (!Array.isArray(registry.deadlines)) fail("deadlines must be a list");
  if (!Array.isArray(registry.history)) fail("history must be a list");
  if (!Array.isArray(registry.conflicts)) fail("conflicts must be a list");

  const conferenceIds = new Set();
  const conferencesById = new Map();
  for (const conference of registry.conferences) {
    requireValue(conference.id, "A conference is missing id");
    if (!slugPattern.test(conference.id)) fail(`Conference ID is not a slug: ${conference.id}`);
    if (conferenceIds.has(conference.id)) fail(`Duplicate conference ID: ${conference.id}`);
    conferenceIds.add(conference.id);
    conferencesById.set(conference.id, conference);
    requireValue(conference.community, `Conference ${conference.id} is missing community`);
    requireValue(conference.name, `Conference ${conference.id} is missing name`);
    if (!/^\d{4}$/.test(conference.edition)) fail(`Conference ${conference.id} has an invalid monitored edition`);
    if (conference.aliases !== undefined && !Array.isArray(conference.aliases)) {
      fail(`Conference ${conference.id} aliases must be a list`);
    }
    if (!conference.monitored_submissions || Array.isArray(conference.monitored_submissions)) {
      fail(`Conference ${conference.id} monitored_submissions must be a mapping`);
    }
    const submissionEntries = Object.entries(conference.monitored_submissions);
    if (!submissionEntries.length) fail(`Conference ${conference.id} has no monitored submissions`);
    const submissionLabels = new Set();
    for (const [id, label] of submissionEntries) {
      if (!slugPattern.test(id)) fail(`Conference ${conference.id} has an invalid submission ID: ${id}`);
      requireValue(label, `Conference ${conference.id} submission ${id} has no label`);
      if (submissionLabels.has(label)) fail(`Conference ${conference.id} has duplicate submission label: ${label}`);
      submissionLabels.add(label);
    }
    if (!Array.isArray(conference.official_sources) || !conference.official_sources.length) {
      fail(`Conference ${conference.id} has no official source`);
    }
    const sourceIds = new Set();
    for (const source of conference.official_sources) {
      requireValue(source.id, `Conference ${conference.id} has a source without an ID`);
      if (!slugPattern.test(source.id)) fail(`Conference ${conference.id} has an invalid source ID: ${source.id}`);
      if (sourceIds.has(source.id)) fail(`Conference ${conference.id} has duplicate source ID: ${source.id}`);
      sourceIds.add(source.id);
      requireHttps(source.url, `Conference ${conference.id} source ${source.id} must use HTTPS`);
      requireValue(source.title, `Conference ${conference.id} source ${source.id} has no title`);
      if (source.edition !== "series" && !/^\d{4}$/.test(source.edition)) {
        fail(`Conference ${conference.id} source ${source.id} has an invalid edition`);
      }
      if (!sourceStates.has(source.status)) {
        fail(`Conference ${conference.id} source ${source.id} has an invalid status`);
      }
      if (source.status === "current" && source.edition !== conference.edition) {
        fail(`Conference ${conference.id} source ${source.id} is current but belongs to edition ${source.edition}`);
      }
      if (source.covers !== "all") {
        if (!Array.isArray(source.covers) || !source.covers.length) {
          fail(`Conference ${conference.id} source ${source.id} must cover all or a non-empty submission list`);
        }
        for (const submission of source.covers) {
          if (!conference.monitored_submissions[submission]) {
            fail(`Conference ${conference.id} source ${source.id} covers unknown submission ${submission}`);
          }
        }
      }
      requireTimestamp(source.verified_at, `Conference ${conference.id} source ${source.id} has an invalid verified_at`);
    }
  }

  const deadlineIds = new Set();
  const deadlinesById = new Map();
  for (const deadline of registry.deadlines) {
    requireValue(deadline.id, "A deadline is missing id");
    if (deadlineIds.has(deadline.id)) fail(`Duplicate deadline ID: ${deadline.id}`);
    deadlineIds.add(deadline.id);
    deadlinesById.set(deadline.id, deadline);
    const conference = conferencesById.get(deadline.conference);
    if (!conference) fail(`Deadline ${deadline.id} refers to unknown conference ${deadline.conference}`);
    if (!/^\d{4}$/.test(deadline.edition)) fail(`Deadline ${deadline.id} has an invalid edition`);
    if (deadline.edition !== conference.edition) {
      fail(`Deadline ${deadline.id} edition does not match ${conference.id}'s monitored edition`);
    }
    if (!Array.isArray(deadline.submissions) || !deadline.submissions.length) {
      fail(`Deadline ${deadline.id} must refer to at least one submission`);
    }
    for (const submission of deadline.submissions) {
      if (!conference.monitored_submissions[submission]) {
        fail(`Deadline ${deadline.id} refers to unknown submission ${submission}`);
      }
    }
    if (deadline.submissions.length > 1 && !deadline.label) {
      fail(`Deadline ${deadline.id} combines submissions and needs a display label`);
    }
    const source = conference.official_sources.find((candidate) => candidate.id === deadline.source);
    if (!source) fail(`Deadline ${deadline.id} refers to unknown source ${deadline.source}`);
    if (source.covers !== "all") {
      for (const submission of deadline.submissions) {
        if (!source.covers.includes(submission)) {
          fail(`Deadline ${deadline.id} source ${source.id} does not cover ${submission}`);
        }
      }
    }
    requireTimestamp(deadline.deadline_at, `Deadline ${deadline.id} has an invalid deadline_at`);
    requireValue(deadline.timezone, `Deadline ${deadline.id} has no timezone`);
    if (deadline.sequence !== undefined && (!Number.isInteger(deadline.sequence) || deadline.sequence < 0)) {
      fail(`Deadline ${deadline.id} has an invalid sequence`);
    }
    const timezoneOffset = deadline.timezone.match(/UTC([+-]\d{2})(?::(\d{2}))?/);
    if (timezoneOffset) {
      const expectedOffset = `${timezoneOffset[1]}:${timezoneOffset[2] ?? "00"}`;
      if (!deadline.deadline_at.endsWith(expectedOffset)) {
        fail(`Deadline ${deadline.id} timestamp does not match timezone ${deadline.timezone}`);
      }
    }
    if (deadline.timezone === "AoE (UTC-12)" && !deadline.deadline_at.endsWith("T23:59:00-12:00")) {
      fail(`Deadline ${deadline.id} must use 23:59 at UTC-12 for AoE`);
    }
    if (deadline.placeholder) {
      if (!/^\d{4}$/.test(deadline.placeholder.based_on_edition)
        || Number(deadline.placeholder.based_on_edition) >= Number(deadline.edition)) {
        fail(`Placeholder ${deadline.id} must cite an earlier edition`);
      }
      requireTimestamp(
        deadline.placeholder.based_on_deadline_at,
        `Placeholder ${deadline.id} has an invalid based_on_deadline_at`,
      );
      if (deadline.deadline_at.slice(4) !== deadline.placeholder.based_on_deadline_at.slice(4)) {
        fail(`Placeholder ${deadline.id} does not preserve the historical month, day, time, and offset`);
      }
      if (source.edition !== deadline.placeholder.based_on_edition) {
        fail(`Placeholder ${deadline.id} source edition does not match its historical basis`);
      }
      if (deadline.content && !deadline.content.includes("previous-edition requirement")) {
        fail(`Placeholder ${deadline.id} content must be labeled as a previous-edition requirement`);
      }
    } else if (source.edition !== deadline.edition || source.status !== "current") {
      fail(`Confirmed deadline ${deadline.id} must cite a current source for edition ${deadline.edition}`);
    }
  }

  const historyByDeadline = new Map();
  for (const change of registry.history) {
    const deadline = deadlinesById.get(change.deadline);
    if (!deadline) fail(`History entry refers to unknown deadline ${change.deadline}`);
    requireTimestamp(change.detected_at, `History entry for ${change.deadline} has an invalid detected_at`);
    requireTimestamp(change.from, `History entry for ${change.deadline} has an invalid from timestamp`);
    requireTimestamp(change.to, `History entry for ${change.deadline} has an invalid to timestamp`);
    const conference = conferencesById.get(deadline.conference);
    if (!conference.official_sources.some((source) => source.id === change.source)) {
      fail(`History entry for ${change.deadline} refers to unknown source ${change.source}`);
    }
    const changes = historyByDeadline.get(change.deadline) ?? [];
    changes.push(change);
    historyByDeadline.set(change.deadline, changes);
  }
  for (const [deadlineId, changes] of historyByDeadline) {
    const deadline = deadlinesById.get(deadlineId);
    for (let index = 1; index < changes.length; index += 1) {
      if (changes[index - 1].to !== changes[index].from) {
        fail(`History for ${deadlineId} is not a continuous chain`);
      }
      if (Date.parse(changes[index - 1].detected_at) > Date.parse(changes[index].detected_at)) {
        fail(`History for ${deadlineId} is not chronological`);
      }
    }
    if (changes.at(-1).to !== deadline.deadline_at) {
      fail(`Latest history entry for ${deadlineId} does not match its current deadline`);
    }
    if (!Number.isInteger(deadline.sequence) || deadline.sequence < changes.length) {
      fail(`Moved deadline ${deadlineId} must increment sequence for every recorded move`);
    }
  }

  const conflictIds = new Set();
  for (const conflict of registry.conflicts) {
    requireValue(conflict.id, "A conflict is missing id");
    if (conflictIds.has(conflict.id)) fail(`Duplicate conflict ID: ${conflict.id}`);
    conflictIds.add(conflict.id);
    const conference = conferencesById.get(conflict.conference);
    if (!conference) fail(`Conflict ${conflict.id} refers to unknown conference ${conflict.conference}`);
    if (!conference.monitored_submissions[conflict.submission]) {
      fail(`Conflict ${conflict.id} refers to unknown submission ${conflict.submission}`);
    }
    requireTimestamp(conflict.detected_at, `Conflict ${conflict.id} has an invalid detected_at`);
    if (!Array.isArray(conflict.sources) || conflict.sources.length < 2) {
      fail(`Conflict ${conflict.id} must retain at least two sources`);
    }
    for (const source of conflict.sources) {
      requireHttps(source.url, `Conflict ${conflict.id} has a non-HTTPS source`);
      requireValue(source.claim, `Conflict ${conflict.id} source ${source.url} has no claim`);
    }
  }
}

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
    const characterSize = new TextEncoder().encode(character).length;
    if (size + characterSize > 73) {
      chunks.push(current);
      current = character;
      size = characterSize;
    } else {
      current += character;
      size += characterSize;
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

function renderCalendar(registry) {
  const conferences = new Map(registry.conferences.map((conference) => [conference.id, conference]));
  const eventLines = (deadline) => {
    const conference = conferences.get(deadline.conference);
    const source = conference.official_sources.find((candidate) => candidate.id === deadline.source);
    const label = deadline.label ?? conference.monitored_submissions[deadline.submissions[0]];
    const isPlaceholder = Boolean(deadline.placeholder);
    const editionLabel = isPlaceholder ? `${deadline.edition} (PLACEHOLDER)` : deadline.edition;
    const date = deadline.deadline_at.slice(0, 10);
    const lines = [
      "BEGIN:VEVENT",
      `UID:${escapeText(deadline.id)}@conference-deadlines`,
      `DTSTAMP:${utcStamp(source.verified_at)}`,
      `LAST-MODIFIED:${utcStamp(source.verified_at)}`,
      `SEQUENCE:${Number(deadline.sequence ?? 0)}`,
      `SUMMARY:${escapeText(`${conference.calendar_name ?? conference.name} ${editionLabel} — ${label}`)}`,
      `DTSTART;VALUE=DATE:${dateStamp(date)}`,
      `DTEND;VALUE=DATE:${dateStamp(nextDate(date))}`,
    ];

    const placeholderNote = isPlaceholder
      ? `PLACEHOLDER: projected from the official ${deadline.placeholder.based_on_edition} deadline at ${deadline.placeholder.based_on_deadline_at}; this is not a confirmed ${deadline.edition} date and the official source below is historical.`
      : null;
    const aoeNote = deadline.timezone === "AoE (UTC-12)"
      ? "23:59 AoE means the cutoff is 14:00 on the following day in Central European summer time (CEST, UTC+2), or 13:00 in winter (CET, UTC+1)."
      : null;
    const notes = [placeholderNote, deadline.notes, aoeNote].filter(Boolean).join(" ") || "No additional notes.";
    const description = [
      `Community: ${conference.community}`,
      `Submission type: ${label}`,
      `Content: ${deadline.content ?? "See the official source for submission requirements."}`,
      "",
      `Notes: ${notes}`,
      "",
      `Official source: ${source.url}`,
      `Verified: ${source.verified_at}`,
    ].join("\n");

    lines.push(`DESCRIPTION:${escapeText(description)}`);
    lines.push(`URL:${source.url}`);
    lines.push("TRANSP:TRANSPARENT");
    lines.push(`STATUS:${isPlaceholder ? "TENTATIVE" : "CONFIRMED"}`);
    lines.push("END:VEVENT");
    return lines;
  };

  const deadlines = [...registry.deadlines].sort((left, right) => left.deadline_at.localeCompare(right.deadline_at));
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
    ...deadlines.flatMap(eventLines),
    "END:VCALENDAR",
  ];
  return `${lines.map(fold).join("\r\n")}\r\n`;
}

function parsePlanOptions(arguments_) {
  const options = { asOf: new Date(), full: false, json: false };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--full") options.full = true;
    else if (argument === "--json") options.json = true;
    else if (argument === "--as-of") options.asOf = new Date(arguments_[++index]);
    else if (argument.startsWith("--as-of=")) options.asOf = new Date(argument.slice(8));
    else fail(`Unknown plan option: ${argument}`);
  }
  if (Number.isNaN(options.asOf.valueOf())) fail("--as-of must be an ISO timestamp or date");
  return options;
}

function stableBucket(value) {
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.codePointAt(0)) >>> 0;
  return hash % 4;
}

function buildPlan(registry, options) {
  const asOf = options.asOf;
  const week = Math.floor(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()) / 604_800_000);
  const deadlinesByConference = new Map();
  for (const deadline of registry.deadlines) {
    const deadlines = deadlinesByConference.get(deadline.conference) ?? [];
    deadlines.push(deadline);
    deadlinesByConference.set(deadline.conference, deadlines);
  }
  const conflictsByConference = new Map();
  for (const conflict of registry.conflicts) {
    const conflicts = conflictsByConference.get(conflict.conference) ?? [];
    conflicts.push(conflict);
    conflictsByConference.set(conflict.conference, conflicts);
  }

  const fetchByUrl = new Map();
  const discover = [];
  let deferred = 0;
  let dueConferences = 0;
  const priorityOrder = { critical: 0, high: 1, normal: 2 };

  for (const conference of registry.conferences) {
    const deadlines = deadlinesByConference.get(conference.id) ?? [];
    const conflicts = conflictsByConference.get(conference.id) ?? [];
    let priority = "normal";
    const reasons = new Set(options.full ? ["full"] : []);
    if (conflicts.length) {
      priority = "critical";
      reasons.add("conflict");
    }
    for (const deadline of deadlines) {
      const days = (Date.parse(deadline.deadline_at) - asOf.valueOf()) / 86_400_000;
      if (days < 0) continue;
      if (!deadline.placeholder && days <= 14) {
        priority = "critical";
        reasons.add(`confirmed-in-${Math.ceil(days)}d`);
        continue;
      }
      if (!deadline.placeholder && days <= 45) {
        if (priority === "normal") priority = "high";
        reasons.add(`confirmed-in-${Math.ceil(days)}d`);
      }
      if (deadline.placeholder && days <= 90) {
        if (priority === "normal") priority = "high";
        reasons.add(`placeholder-in-${Math.ceil(days)}d`);
      }
    }
    if (!options.full && priority === "normal") reasons.add("rotation");

    const due = options.full || priority !== "normal" || stableBucket(conference.id) === week % 4;
    const submissionIds = Object.keys(conference.monitored_submissions);
    if (!due) {
      deferred += submissionIds.length;
      continue;
    }
    dueConferences += 1;

    const currentSources = conference.official_sources.filter(
      (source) => source.status === "current" && source.edition === conference.edition,
    );
    const assignments = new Map();
    for (const submission of submissionIds) {
      const candidates = currentSources.filter(
        (source) => source.covers === "all" || source.covers.includes(submission),
      );
      const deadlineSourceIds = new Set(
        deadlines.filter((deadline) => deadline.submissions.includes(submission)).map((deadline) => deadline.source),
      );
      candidates.sort((left, right) => {
        const leftReferenced = deadlineSourceIds.has(left.id) ? 0 : 1;
        const rightReferenced = deadlineSourceIds.has(right.id) ? 0 : 1;
        if (leftReferenced !== rightReferenced) return leftReferenced - rightReferenced;
        const leftSpecific = left.covers === "all" ? 1 : 0;
        const rightSpecific = right.covers === "all" ? 1 : 0;
        return leftSpecific - rightSpecific;
      });
      if (candidates[0]) assignments.set(submission, candidates[0]);
    }

    for (const source of currentSources) {
      const submissions = submissionIds.filter((submission) => assignments.get(submission)?.id === source.id);
      if (!submissions.length) continue;
      const canonicalUrl = new URL(source.url).href;
      const group = fetchByUrl.get(canonicalUrl) ?? { priority, url: source.url, reasons: new Set(), checks: [] };
      if (priorityOrder[priority] < priorityOrder[group.priority]) group.priority = priority;
      for (const reason of reasons) group.reasons.add(reason);
      const sourceEvents = deadlines
        .filter((deadline) => deadline.submissions.some((submission) => submissions.includes(submission)))
        .map((deadline) => ({
          id: deadline.id,
          at: deadline.deadline_at,
          state: deadline.placeholder ? "placeholder" : "confirmed",
          sequence: deadline.sequence ?? 0,
        }));
      group.checks.push({
        conference: conference.id,
        edition: conference.edition,
        source: source.id,
        submissions,
        events: sourceEvents,
      });
      fetchByUrl.set(canonicalUrl, group);
    }

    const unresolved = submissionIds.filter((submission) => !assignments.has(submission));
    if (unresolved.length) {
      discover.push({
        priority,
        conference: conference.id,
        edition: conference.edition,
        submissions: unresolved,
        reasons: [...reasons].sort(),
        roots: conference.official_sources.map((source) => ({
          id: source.id,
          url: source.url,
          edition: source.edition,
          status: source.status,
        })),
        events: deadlines
          .filter((deadline) => deadline.submissions.some((submission) => unresolved.includes(submission)))
          .map((deadline) => ({
            id: deadline.id,
            at: deadline.deadline_at,
            state: deadline.placeholder ? "placeholder" : "confirmed",
            sequence: deadline.sequence ?? 0,
          })),
      });
    }
  }

  const fetch = [...fetchByUrl.values()].map((group) => ({
    priority: group.priority,
    url: group.url,
    reasons: [...group.reasons].sort(),
    checks: group.checks.sort((left, right) => left.conference.localeCompare(right.conference)),
  }));
  fetch.sort((left, right) => priorityOrder[left.priority] - priorityOrder[right.priority] || left.url.localeCompare(right.url));
  discover.sort((left, right) => priorityOrder[left.priority] - priorityOrder[right.priority]
    || left.conference.localeCompare(right.conference));
  return {
    schema: 1,
    as_of: asOf.toISOString(),
    summary: {
      monitored_submissions: registry.conferences.reduce(
        (total, conference) => total + Object.keys(conference.monitored_submissions).length,
        0,
      ),
      due_conferences: dueConferences,
      fetch_urls: fetch.length,
      discover_conferences: discover.length,
      discover_submissions: discover.reduce((total, item) => total + item.submissions.length, 0),
      deferred_submissions: deferred,
      conflicts: registry.conflicts.length,
    },
    fetch,
    discover,
    conflicts: registry.conflicts.map((conflict) => ({
      id: conflict.id,
      conference: conflict.conference,
      submission: conflict.submission,
      detected_at: conflict.detected_at,
      sources: conflict.sources,
    })),
  };
}

function renderPlanText(plan) {
  const lines = [`Maintenance plan for ${plan.as_of}`];
  for (const conflict of plan.conflicts) {
    lines.push("", `CRITICAL CONFLICT ${conflict.id} ${conflict.conference}/${conflict.submission}`);
    for (const source of conflict.sources) lines.push(`  ${source.url}: ${source.claim}`);
  }
  for (const fetch of plan.fetch) {
    lines.push("", `${fetch.priority.toUpperCase()} FETCH ${fetch.url}`);
    for (const check of fetch.checks) {
      lines.push(`  ${check.conference}@${check.edition} source=${check.source}: ${check.submissions.join(", ")}`);
      if (check.events.length) {
        lines.push(`  known: ${check.events.map((event) => `${event.id}=${event.at} (${event.state}, seq=${event.sequence})`).join(", ")}`);
      }
    }
  }
  for (const discovery of plan.discover) {
    lines.push("", `${discovery.priority.toUpperCase()} DISCOVER ${discovery.conference}@${discovery.edition}`);
    lines.push(`  submissions: ${discovery.submissions.join(", ")}`);
    lines.push(`  roots: ${discovery.roots.map((root) => `${root.id}[${root.status}@${root.edition}]=${root.url}`).join(", ")}`);
    if (discovery.events.length) {
      lines.push(`  known: ${discovery.events.map((event) => `${event.id}=${event.at} (${event.state}, seq=${event.sequence})`).join(", ")}`);
    }
  }
  lines.push(
    "",
    `OK monitored=${plan.summary.monitored_submissions} due=${plan.summary.due_conferences} fetch_urls=${plan.summary.fetch_urls} discover=${plan.summary.discover_conferences} deferred=${plan.summary.deferred_submissions} conflicts=${plan.summary.conflicts}`,
  );
  return lines.join("\n");
}

const [command, ...arguments_] = process.argv.slice(2);
try {
  if (!new Set(["plan", "build", "check"]).has(command)) {
    fail("Usage: node scripts/maintain.mjs <plan|build|check>");
  }
  const registry = await readRegistry();
  if (command === "plan") {
    const options = parsePlanOptions(arguments_);
    const plan = buildPlan(registry, options);
    console.log(options.json ? JSON.stringify(plan) : renderPlanText(plan));
  } else {
    if (arguments_.length) fail(`${command} does not accept options`);
    const expectedCalendar = renderCalendar(registry);
    const placeholderCount = registry.deadlines.filter((deadline) => deadline.placeholder).length;
    if (command === "build") {
      const temporaryPath = new URL(".calendar.ics.tmp", root);
      try {
        await writeFile(temporaryPath, expectedCalendar, "utf8");
        await rename(temporaryPath, calendarPath);
      } finally {
        await unlink(temporaryPath).catch(() => {});
      }
      console.log(`Built calendar.ics with ${registry.deadlines.length - placeholderCount} confirmed and ${placeholderCount} placeholder deadline(s).`);
    } else {
      const actualCalendar = await readFile(calendarPath, "utf8");
      if (actualCalendar !== expectedCalendar) fail("calendar.ics is stale; run npm run build");
      console.log(`Checked ${registry.conferences.length} conferences and ${registry.deadlines.length} calendar deadline(s).`);
    }
  }
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
}
