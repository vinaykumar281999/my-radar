import { formatDeparture } from "@/lib/dates";

/** Gas split limits (the database checks the same). */
export const GAS_SPLIT_MAX = 1000;
export const STOPS_MAX = 120;

// Region → currency for where the driver's browser is set. Anything else: USD.
const EURO = ["AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK"];
const REGION_CURRENCY: Record<string, string> = {
  US: "USD", CA: "CAD", MX: "MXN", BR: "BRL", AR: "ARS", CL: "CLP", CO: "COP", PE: "PEN",
  GB: "GBP", CH: "CHF", SE: "SEK", NO: "NOK", DK: "DKK", IS: "ISK", PL: "PLN", CZ: "CZK", HU: "HUF", RO: "RON", TR: "TRY",
  AU: "AUD", NZ: "NZD", IN: "INR", JP: "JPY", CN: "CNY", HK: "HKD", TW: "TWD", KR: "KRW", SG: "SGD", MY: "MYR",
  TH: "THB", ID: "IDR", PH: "PHP", VN: "VND", ZA: "ZAR", NG: "NGN", KE: "KES", EG: "EGP", AE: "AED", SA: "SAR", IL: "ILS",
  ...Object.fromEntries(EURO.map((r) => [r, "EUR"])),
};

/**
 * The currency a gas split is entered in, from the driver's browser locale
 * ("en-US" → USD, "de-DE" → EUR, "en-GB" → GBP). It's stored with the amount,
 * so riders anywhere see the driver's currency, not their own.
 */
export function currencyForLocale(locale: string | undefined | null): string {
  if (!locale) return "USD";
  try {
    const region = new Intl.Locale(locale).maximize().region;
    return (region && REGION_CURRENCY[region]) || "USD";
  } catch {
    return "USD";
  }
}

/** "~$40/person gas", "~€12.50/person gas". Same output on the server and in every browser. */
export function formatGasSplit(amount: number, currency: string): string {
  const whole = Number.isInteger(amount);
  let money: string;
  try {
    money = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    }).format(amount);
  } catch {
    money = `${amount} ${currency}`;
  }
  return `~${money}/person gas`;
}

/** "Back Sun, Dec 6 · 4:00 PM PST" (in the trip's own zone, like the departure). */
export function formatReturn(returnsAt: string, tz: string) {
  return `Back ${formatDeparture(returnsAt, tz)}`;
}

/** The optional long-trip details, in reading order; empty if none are set. */
export function carpoolExtras(plan: {
  round_trip?: boolean | null;
  returns_at?: string | null;
  departs_tz?: string | null;
  gas_split?: number | null;
  gas_currency?: string | null;
  stops?: string | null;
}): string[] {
  const parts: string[] = [];
  if (plan.round_trip) {
    parts.push(plan.returns_at && plan.departs_tz ? `Round trip · ${formatReturn(plan.returns_at, plan.departs_tz)}` : "Round trip");
  }
  if (plan.gas_split != null && plan.gas_currency) parts.push(formatGasSplit(Number(plan.gas_split), plan.gas_currency));
  if (plan.stops?.trim()) parts.push(`Stops: ${plan.stops.trim()}`);
  return parts;
}
