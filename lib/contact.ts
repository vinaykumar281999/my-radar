export type ContactLink = {
  kind: "instagram" | "whatsapp";
  href: string;
  label: string;
};

const IG_HANDLE = /^[A-Za-z0-9._]{1,30}$/;
const IG_URL = /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9._]{1,30})\/?(?:\?.*)?$/i;
const PHONE = /^\+?[\d\s\-().]{7,20}$/;

/**
 * Turn a free-text contact ("@maya.c", "instagram.com/maya.c", "+1 555 123 4567")
 * into a one-tap link. Returns null when it's neither a handle nor a phone number.
 */
export function parseContact(raw: string): ContactLink | null {
  const value = raw.trim();

  const handle = value.startsWith("@") ? value.slice(1) : IG_URL.exec(value)?.[1];
  if (handle && IG_HANDLE.test(handle)) {
    return { kind: "instagram", href: `https://instagram.com/${handle}`, label: `@${handle}` };
  }

  if (PHONE.test(value)) {
    // wa.me wants the full international number, digits only.
    const digits = value.replace(/\D/g, "");
    if (digits.length >= 7 && digits.length <= 15) {
      return { kind: "whatsapp", href: `https://wa.me/${digits}`, label: value };
    }
  }

  return null;
}

/**
 * Attribution that is safe to show on a public page: the @handle when the
 * contact is an Instagram handle, otherwise the person's first name.
 * Phone numbers are never returned.
 */
export function publicAttribution(contact: string, name: string) {
  const link = parseContact(contact);
  if (link?.kind === "instagram") return link.label;
  return name.trim().split(/\s+/)[0]?.slice(0, 60) || null;
}
