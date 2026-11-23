import { formatDateRange } from "@/lib/dates";

export const POLL_MIN_OPTIONS = 2;
export const POLL_MAX_OPTIONS = 4;

/** One row of plan_poll(): an option with its vote count, no names. */
export type PollCount = {
  plan_id: string;
  option_id: string;
  start_date: string;
  end_date: string | null;
  votes: number;
};

/** An option as the owner manages it (plan_date_options). */
export type PollOption = {
  id: string;
  plan_id: string;
  start_date: string;
  end_date: string | null;
};

/** The owner's view of a ballot: who, and which options. */
export type PollBallot = {
  id: string;
  voter_name: string;
  voter_contact: string;
  user_id: string | null;
  created_at: string;
  option_ids: string[];
};

export function optionLabel(o: { start_date: string; end_date: string | null }) {
  return formatDateRange(o.start_date, o.end_date);
}

/** Date order, then shorter first; the order everyone sees. */
export function sortOptions<T extends { start_date: string; end_date: string | null }>(options: T[]): T[] {
  return [...options].sort(
    (a, b) =>
      a.start_date.localeCompare(b.start_date) ||
      (a.end_date ?? a.start_date).localeCompare(b.end_date ?? b.start_date),
  );
}

/**
 * Why a new option can't be added (null if it can): at most 4, the end can't
 * be before the start, no exact duplicates.
 */
export function newOptionProblem(
  existing: { start_date: string; end_date: string | null }[],
  start: string,
  end: string,
): string | null {
  if (existing.length >= POLL_MAX_OPTIONS) return `Up to ${POLL_MAX_OPTIONS} options.`;
  if (!start) return "Pick a start date.";
  if (end && end < start) return "The end can't be before the start.";
  const endOrNull = end && end !== start ? end : null;
  if (existing.some((o) => o.start_date === start && (o.end_date ?? null) === endOrNull))
    return "That option is already there.";
  return null;
}

/** Per option, for the owner: votes and who voted, plus which options lead. */
export function tallyBallots(options: PollOption[], ballots: PollBallot[]) {
  const rows = sortOptions(options).map((o) => {
    const voters = ballots.filter((b) => b.option_ids.includes(o.id));
    return {
      option: o,
      votes: voters.length,
      voters: voters.map((b) => b.voter_name),
    };
  });
  const top = Math.max(0, ...rows.map((r) => r.votes));
  return rows.map((r) => ({ ...r, leading: top > 0 && r.votes === top }));
}

/** The poll is open to voters: enough options and not decided yet. */
export function pollIsOpen(optionCount: number, closedAt: string | null | undefined) {
  return !closedAt && optionCount >= POLL_MIN_OPTIONS;
}

/** "5 votes" / "1 vote". */
export function votesLabel(n: number) {
  return `${n} ${n === 1 ? "vote" : "votes"}`;
}
