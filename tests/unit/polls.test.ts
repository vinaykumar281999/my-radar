import assert from "node:assert/strict";
import { newOptionProblem, optionLabel, pollIsOpen, sortOptions, tallyBallots, votesLabel, type PollBallot, type PollOption } from "@/lib/polls";

const opt = (id: string, start_date: string, end_date: string | null = null): PollOption => ({ id, plan_id: "p", start_date, end_date });
const ballot = (voter_name: string, option_ids: string[]): PollBallot => ({
  id: voter_name, voter_name, voter_contact: "@x", user_id: null, created_at: "2026-11-23T00:00:00Z", option_ids,
});

test("options read as date ranges, in date order", () => {
  assert.equal(optionLabel(opt("a", "2026-12-11", "2026-12-14")), "Dec 11–14");
  assert.equal(optionLabel(opt("a", "2026-12-12")), "Sat, Dec 12");
  assert.deepEqual(sortOptions([opt("b", "2026-12-18"), opt("a", "2026-12-11", "2026-12-14"), opt("c", "2026-12-11")]).map((o) => o.id), ["c", "a", "b"]);
});

test("adding options: up to 4, sensible ranges, no duplicates", () => {
  const two = [opt("a", "2026-12-11", "2026-12-14"), opt("b", "2026-12-18")];
  assert.equal(newOptionProblem(two, "2027-01-02", ""), null);
  assert.equal(newOptionProblem(two, "2027-01-02", "2027-01-02"), null, "same-day end is just a single day");
  assert.match(newOptionProblem(two, "", "") ?? "", /start/);
  assert.match(newOptionProblem(two, "2027-01-05", "2027-01-02") ?? "", /before the start/);
  assert.match(newOptionProblem(two, "2026-12-11", "2026-12-14") ?? "", /already/);
  assert.match(newOptionProblem(two, "2026-12-18", "2026-12-18") ?? "", /already/, "a one-day duplicate, entered with an end date");
  const four = [...two, opt("c", "2027-01-01"), opt("d", "2027-01-08")];
  assert.match(newOptionProblem(four, "2027-02-01", "") ?? "", /Up to 4/);
});

test("the owner's tally counts each ballot once per option and marks the leaders", () => {
  const options = [opt("a", "2026-12-11"), opt("b", "2026-12-18"), opt("c", "2027-01-02")];
  const rows = tallyBallots(options, [ballot("Ann", ["a", "b"]), ballot("Bob", ["b"]), ballot("Cy", ["b", "c"])]);
  assert.deepEqual(rows.map((r) => [r.option.id, r.votes, r.voters.join("+"), r.leading]), [
    ["a", 1, "Ann", false],
    ["b", 3, "Ann+Bob+Cy", true],
    ["c", 1, "Cy", false],
  ]);
  assert.ok(tallyBallots(options, []).every((r) => !r.leading), "no votes: nobody leads");
});

test("a poll is open with 2+ options until something is picked", () => {
  assert.equal(pollIsOpen(1, null), false);
  assert.equal(pollIsOpen(2, null), true);
  assert.equal(pollIsOpen(4, "2026-11-23T10:00:00Z"), false);
  assert.equal(votesLabel(1), "1 vote");
  assert.equal(votesLabel(0), "0 votes");
});
