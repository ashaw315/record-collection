/**
 * The header's type, in one place (§G.1, step 74; §24 via step 80).
 *
 * §4.1 counts the header in the label system -- "Five nav items, one
 * wordmark", mono 11, uppercase, ".12em in the nav strip only" -- at line
 * height 1 (§G.2), so the type's own box is what is centred. §24 calls the
 * record detail's Edit and Delete record "the nav's own type", so they take
 * this string too, rather than the shared label style with overrides laid
 * over it: one string means a change to the header's type cannot miss the
 * slot.
 *
 * Its own module, not an export of AppHeader: AppHeader is a client
 * component, and the record page that renders Edit is a server component,
 * which cannot read a plain value exported from a client module.
 */
export const NAV_TYPE = 'font-mono text-[11px] leading-none uppercase tracking-[0.12em] whitespace-nowrap';
