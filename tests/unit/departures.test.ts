import assert from "node:assert/strict";
import { formatDeparture, utcToZonedInput, zonedInputToUtc } from "@/lib/dates";

const LA = "America/Los_Angeles";

test("wall time in a zone converts to UTC and back", () => {
  assert.equal(zonedInputToUtc("2026-12-04T15:30", LA), "2026-12-04T23:30:00.000Z"); // PST, UTC-8
  assert.equal(zonedInputToUtc("2026-07-04T09:00", LA), "2026-07-04T16:00:00.000Z"); // PDT, UTC-7
  assert.equal(utcToZonedInput("2026-12-04T23:30:00.000Z", LA), "2026-12-04T15:30");
  assert.equal(zonedInputToUtc("2026-12-04T15:30", "Asia/Kolkata"), "2026-12-04T10:00:00.000Z"); // +5:30
});

test("conversion is right across the daylight-saving switch", () => {
  // US DST ends 2026-11-01 at 2:00 -> 1:00. 3:00 that day is PST (UTC-8).
  assert.equal(zonedInputToUtc("2026-11-01T03:00", LA), "2026-11-01T11:00:00.000Z");
  // DST starts 2026-03-08 at 2:00 -> 3:00. 4:00 that day is PDT (UTC-7).
  assert.equal(zonedInputToUtc("2026-03-08T04:00", LA), "2026-03-08T11:00:00.000Z");
});

test("departures display in their own zone", () => {
  assert.equal(formatDeparture("2026-12-04T23:30:00.000Z", LA), "Fri, Dec 4 · 3:30 PM PST");
  assert.equal(formatDeparture("2026-12-04T23:30:00.000Z", "Europe/London"), "Fri, Dec 4 · 11:30 PM GMT");
});

test("carpools export as timed calendar events", async () => {
  const { buildCalendar, googleCalendarUrl } = await import("@/lib/ics");
  const event = { uid: "c@radar", title: "Ride", start: "2026-12-04", startAt: "2026-12-04T23:30:00.000Z" };
  const ics = buildCalendar([event]);
  assert.match(ics, /DTSTART:20261204T233000Z\r\n/);
  assert.match(ics, /DTEND:20261205T003000Z\r\n/);
  assert.doesNotMatch(ics, /VALUE=DATE/);
  assert.equal(new URL(googleCalendarUrl(event)).searchParams.get("dates"), "20261204T233000Z/20261205T003000Z");
});
