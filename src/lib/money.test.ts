import { describe, expect, it } from 'vitest';
import { CURRENCY_SYMBOL, formatMoney } from './money';

/**
 * One money formatter for the whole app.
 *
 * **The currency was never specified.** SPEC.md names none; `£` was assumed in
 * step 5 and copied into three formatters. Adam is in New York, and §10a's
 * market data arrives in USD — so a record detail page showed "PAID £10.00"
 * directly above a market panel in dollars. Two currencies, one record, neither
 * labelled.
 *
 * **Three formatters became one.** `formatPrice`, `formatTotal` and
 * `formatCeiling` were the same string manipulation with different null
 * handling — the shape that drifts, and the reason the symbol had to be changed
 * in three places instead of one.
 */

describe('formatMoney', () => {
  it('renders USD, the currency this collection is priced in', () => {
    expect(formatMoney('24.50')).toBe('$24.50');
  });

  it('pads to two decimals, because money is read as a fixed shape', () => {
    expect(formatMoney('8')).toBe('$8.00');
    expect(formatMoney('8.5')).toBe('$8.50');
  });

  it('truncates rather than rounding a third decimal', () => {
    /**
     * `NUMERIC(10,2)` cannot hold a third decimal, so anything with one did not
     * come from the column — it came from a caller doing arithmetic. Truncating
     * keeps this function a FORMATTER: rounding here would quietly disagree with
     * whatever the database holds.
     */
    expect(formatMoney('8.999')).toBe('$8.99');
  });

  it('never routes through a float', () => {
    /**
     * The reason this is string manipulation rather than `toLocaleString`.
     * `purchase_price` is `NUMERIC(10,2)` and is carried as a string end to end
     * precisely so it never becomes a float — and 0.1 + 0.2 is the standard
     * demonstration of why. A value at the column's full width must survive
     * exactly.
     */
    expect(formatMoney('12345678.91')).toBe('$12,345,678.91');
  });

  it('groups thousands, because an unpunctuated total is misread', () => {
    // £12405.00 and £1240.50 differ by a decimal point's worth of attention.
    expect(formatMoney('12405.00')).toBe('$12,405.00');
    expect(formatMoney('1240.50')).toBe('$1,240.50');
  });

  it('does not group four digits before the decimal incorrectly', () => {
    // The discriminating case for the grouping regex: 1000 is $1,000.00, not
    // $1,00,0.00 or $1000.00.
    expect(formatMoney('1000.00')).toBe('$1,000.00');
  });

  it('renders a dash for a null amount by default', () => {
    // An em dash reads as "not recorded"; an empty string reads as a bug.
    expect(formatMoney(null)).toBe('—');
  });

  it('can return undefined for a null instead, where the caller omits the row', () => {
    /**
     * `formatCeiling`'s behaviour, preserved: the want list omits the max-price
     * line entirely rather than showing a dash, because "£0.00" or "—" beside a
     * ceiling reads as "I will pay nothing" (§7.2).
     */
    expect(formatMoney(null, { absent: undefined })).toBeUndefined();
  });

  it('formats zero as zero rather than treating it as absent', () => {
    // A recorded £0.00 — a gift, a freebie — is a fact. Only null is absence.
    expect(formatMoney('0.00')).toBe('$0.00');
  });
});

describe('CURRENCY_SYMBOL', () => {
  it('is the dollar sign, in ONE place', () => {
    /**
     * Exported so the change is a single edit next time, and so a test can
     * assert the app agrees with §10a's market data — which arrives in USD from
     * Discogs and cannot be asked for in anything else (`price_suggestions`
     * ignores `curr_abbr`, measured).
     */
    expect(CURRENCY_SYMBOL).toBe('$');
  });
});

describe('a negative amount', () => {
  /**
   * **`$-12.50` puts the sign in the wrong place.** The convention is `-$12.50`
   * — the minus governs the whole amount, not the digits after the symbol — and
   * this is the app's single money formatter, so it is the one place that
   * decides.
   *
   * **Reachability, stated rather than assumed.** `moneySchema` is
   * `^\d{1,8}(\.\d{1,2})?$`, which has no sign, so the API boundary refuses a
   * negative and no ordinary path produces one. There is no CHECK constraint on
   * `records.purchase_price` (verified against the database), so a value
   * corrected by hand in psql — an ordinary thing to do to a personal tool —
   * reaches `formatPrice` on the record detail screen and renders wrongly. The
   * fix costs two lines and the alternative is a formatter that is right only
   * because nothing has tested it.
   */
  it('puts the minus before the symbol, not after it', () => {
    expect(formatMoney('-12.50')).toBe('-$12.50');
  });

  it('groups a large negative correctly', () => {
    // The sign must not disturb the thousands grouping, which reads the whole
    // part as digits.
    expect(formatMoney('-12345.50')).toBe('-$12,345.50');
  });

  it('leaves a positive amount exactly as it was', () => {
    // The regression guard: a sign-handling change must not touch the ordinary
    // path, which is every amount this app has ever shown.
    expect(formatMoney('12345.50')).toBe('$12,345.50');
    expect(formatMoney('0.00')).toBe('$0.00');
  });
});
