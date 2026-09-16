/**
 * The one size the type scale states that no CSS class can carry.
 *
 * §7a's `micro` — 9px, "the spine, and nothing else" — is drawn into an SVG
 * rather than set on an element, so `text-micro` never reaches it as a
 * utility. The wall must still reference the floor BY NAME rather than match
 * it by value (8a §11): two numbers that agree by coincidence are the third
 * coincidence-for-a-margin this project has found. `type-scale.test.ts` holds
 * this equal to the `--text-micro` that `globals.css` declares.
 */
export const MICRO_PX = 9;
