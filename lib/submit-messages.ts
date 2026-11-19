import type { SubmitError } from "@/lib/actions/submit";

/** Friendly copy for a failed interest/pitch submission. */
export function submitErrorMessage(error: SubmitError, hostFirstName: string) {
  switch (error) {
    case "rate_limited":
      return "You've sent a lot in the last few minutes. Try again in 10 minutes.";
    case "verification_failed":
      return "We couldn't verify you're human. Please try again (an ad blocker can cause this).";
    case "too_many_pitches":
      return `${hostFirstName} has a lot of pitches waiting right now. Try again in an hour!`;
    case "pitches_paused":
      return `${hostFirstName} isn't taking pitches right now.`;
    case "sign_in_required":
      return "Sign in to request a seat, so the driver knows who's riding.";
    case "plan_full":
      return "It just filled up. Try again in a moment.";
    case "plan_unavailable":
      return "This isn't available anymore.";
    case "invalid":
      return "Please fill in the required fields.";
    default:
      return "Couldn't send that — please try again.";
  }
}
