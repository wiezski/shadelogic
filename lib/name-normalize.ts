// Helpers for collapsing free-text "measured_by" / "installed_by" values into
// a single canonical person so analytics doesn't split the same human into
// multiple rows (e.g., "Steve" / "steve" / "Steve Wiezbowski").
//
// Strategy:
//   1. canonicalKey()     — stable grouping key (trim + lowercase + collapse ws)
//   2. resolveAgainstProfiles() — given a map of company profiles, try to map a
//      free-text name to a profile's full_name, so "Steve" and "Steve Wiezbowski"
//      both collapse to the profile's canonical display name.
//   3. displayName()      — picks the nicest display string when multiple inputs
//      share the same canonical key (prefers longer / title-cased versions).
//
// Long-term fix is to replace the text column with a profile_id FK, but this
// keeps existing data usable until then.

export type ProfileLite = { id: string; full_name: string | null };

export function canonicalKey(raw: string | null | undefined): string {
  if (!raw) return "__unassigned__";
  const s = raw.trim().toLowerCase().replace(/\s+/g, " ");
  return s || "__unassigned__";
}

// Try to find a profile that matches this free-text name. Matches:
//   - exact case-insensitive full_name
//   - profile's first name equals the text (so "Steve" → "Steve Wiezbowski")
//   - profile's full_name starts with the text, or vice versa
// Returns the profile, or null if no confident match.
export function resolveAgainstProfiles(
  raw: string | null | undefined,
  profiles: ProfileLite[],
): ProfileLite | null {
  if (!raw) return null;
  const needle = raw.trim().toLowerCase();
  if (!needle) return null;

  // exact full_name
  const exact = profiles.find(p => (p.full_name || "").trim().toLowerCase() === needle);
  if (exact) return exact;

  // first-name match (unambiguous only — if 2+ profiles share the first name, skip)
  const firstNameMatches = profiles.filter(p => {
    const fn = (p.full_name || "").trim().split(/\s+/)[0]?.toLowerCase();
    return fn && fn === needle;
  });
  if (firstNameMatches.length === 1) return firstNameMatches[0];

  // prefix / contains (unambiguous only)
  const prefixMatches = profiles.filter(p => {
    const full = (p.full_name || "").trim().toLowerCase();
    return full && (full.startsWith(needle) || needle.startsWith(full));
  });
  if (prefixMatches.length === 1) return prefixMatches[0];

  return null;
}

// Pick the best display form from a set of inputs that collapse to the same key.
// Prefers: longer strings, then mixed-case over all-lower.
export function preferredDisplay(inputs: string[]): string {
  const nonEmpty = inputs.filter(s => s && s.trim().length > 0);
  if (nonEmpty.length === 0) return "Unassigned";
  return nonEmpty.sort((a, b) => {
    if (a.length !== b.length) return b.length - a.length;
    const aMixed = /[A-Z]/.test(a) && /[a-z]/.test(a);
    const bMixed = /[A-Z]/.test(b) && /[a-z]/.test(b);
    if (aMixed && !bMixed) return -1;
    if (!aMixed && bMixed) return 1;
    return 0;
  })[0];
}

// One-shot helper: given a list of records with a free-text name field,
// and the company profiles, returns grouped buckets keyed by canonical identity.
// The bucket's display name prefers the matched profile's full_name when available.
export function groupByPerson<T>(
  records: T[],
  getName: (r: T) => string | null,
  profiles: ProfileLite[],
): Map<string, { displayName: string; profileId: string | null; items: T[] }> {
  const buckets = new Map<string, { displayName: string; profileId: string | null; items: T[]; originals: Set<string> }>();

  for (const record of records) {
    const raw = getName(record);
    const profile = resolveAgainstProfiles(raw, profiles);
    const key = profile ? `profile:${profile.id}` : canonicalKey(raw);

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        displayName: profile?.full_name || (raw?.trim() || "Unassigned"),
        profileId: profile?.id ?? null,
        items: [],
        originals: new Set<string>(),
      };
      buckets.set(key, bucket);
    }
    bucket.items.push(record);
    if (raw) bucket.originals.add(raw.trim());
  }

  // If a bucket didn't resolve to a profile, recompute display from originals.
  for (const bucket of buckets.values()) {
    if (!bucket.profileId) {
      bucket.displayName = preferredDisplay(Array.from(bucket.originals));
    }
  }

  const out = new Map<string, { displayName: string; profileId: string | null; items: T[] }>();
  buckets.forEach((v, k) => out.set(k, { displayName: v.displayName, profileId: v.profileId, items: v.items }));
  return out;
}
