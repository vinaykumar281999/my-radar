/**
 * Spam trap: an off-screen field humans never see or tab to. Bots that fill
 * every input fill this too; forms then fake success without saving.
 * (Off-screen rather than display:none, which some bots skip.)
 */
export function Honeypot({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
      <label>
        Website
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    </div>
  );
}

export const CONTACT_HINT = "Instagram @handle or phone with country code (e.g. +1 555 123 4567)";
