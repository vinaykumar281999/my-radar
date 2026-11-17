import { addDays } from "@/lib/dates";

export type IcsEvent = {
  uid: string;
  title: string;
  /** All-day, "YYYY-MM-DD", inclusive. */
  start: string;
  end?: string | null;
  /** Timed event instead (carpool departure): ISO instant; lasts `durationMinutes` (default 60). */
  startAt?: string | null;
  durationMinutes?: number;
  description?: string | null;
  url?: string | null;
  confirmed?: boolean;
};

function escapeText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** RFC 5545 line folding: at most 75 octets per line, continuation lines start with a space. */
function fold(line: string) {
  const encoder = new TextEncoder();
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    if (bytes + size > 75) {
      out.push(current);
      current = ` ${ch}`;
      bytes = 1 + size;
    } else {
      current += ch;
      bytes += size;
    }
  }
  out.push(current);
  return out.join("\r\n");
}

const compact = (iso: string) => iso.replace(/-/g, "");

/** ISO instant -> "20261204T233000Z". */
function utcStamp(iso: string) {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function stamp() {
  return utcStamp(new Date().toISOString());
}

/** [DTSTART, DTEND] values for an event (timed in UTC, or all-day with an exclusive end). */
function eventRange(e: Pick<IcsEvent, "start" | "end" | "startAt" | "durationMinutes">): [string, string] {
  if (e.startAt) {
    const end = new Date(new Date(e.startAt).getTime() + (e.durationMinutes ?? 60) * 60_000).toISOString();
    return [utcStamp(e.startAt), utcStamp(end)];
  }
  return [compact(e.start), compact(addDays(e.end ?? e.start, 1))];
}

export function buildCalendar(events: IcsEvent[], name = "Radar") {
  const dtstamp = stamp();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Radar//Plans//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
    // Hint for subscribing clients; Google ignores it and polls on its own schedule.
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
  ];
  for (const e of events) {
    const description = [e.description, e.url].filter(Boolean).join("\n\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${dtstamp}`,
      ...(e.startAt
        ? [`DTSTART:${eventRange(e)[0]}`, `DTEND:${eventRange(e)[1]}`]
        : // DTEND is exclusive for all-day events.
          [`DTSTART;VALUE=DATE:${eventRange(e)[0]}`, `DTEND;VALUE=DATE:${eventRange(e)[1]}`]),
      `SUMMARY:${escapeText(e.title)}`,
      `STATUS:${e.confirmed ? "CONFIRMED" : "TENTATIVE"}`,
      "TRANSP:TRANSPARENT",
    );
    if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** Google Calendar "add event" link (all-day, or timed for carpools). */
export function googleCalendarUrl(
  e: Pick<IcsEvent, "title" | "start" | "end" | "startAt" | "durationMinutes" | "description" | "url">,
) {
  const [from, to] = eventRange(e);
  const params = new URLSearchParams({ action: "TEMPLATE", text: e.title, dates: `${from}/${to}` });
  const details = [e.description, e.url].filter(Boolean).join("\n\n");
  if (details) params.set("details", details);
  return `https://calendar.google.com/calendar/render?${params}`;
}
