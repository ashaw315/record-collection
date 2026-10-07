import { describe, expect, it } from 'vitest';
import { FADE_MS, TRAVEL_MS, travelBox, travelPhoto } from './sleeve-travel';

/**
 * §M.7: "The travel is one motion, on one curve... Position, size and the
 * crop all move on it together. The page crops its cover within §33's bound
 * and the modal fits every face, by §M.4, so the crop eases out to the fit
 * as the cover travels."
 */
describe('travelBox: the square between the page’s and the modal’s', () => {
  const page = { left: 960, top: 53, size: 480 };
  const modal = { left: 355, top: 72, size: 730 };

  it('is the page’s square at 0 and the modal’s at 1', () => {
    expect(travelBox(0, page, modal)).toEqual(page);
    expect(travelBox(1, page, modal)).toEqual(modal);
  });

  /* Fails against a size that leads or trails the position. */
  it('moves its left, its top and its size by the same fraction', () => {
    expect(travelBox(0.25, page, modal)).toEqual({ left: 960 - 605 * 0.25, top: 53 + 19 * 0.25, size: 480 + 250 * 0.25 });
  });
});

describe('travelPhoto: the photograph within the travelling square', () => {
  /* A landscape photograph inside §33's bound: the page crops it, so it starts covering the square, its width overhanging. */
  it('starts cropped as the page has it and ends fitted as the modal has it', () => {
    expect(travelPhoto(0, 400, { width: 1000, height: 800 }, 'crop')).toEqual({ width: 500, height: 400 });
    expect(travelPhoto(1, 400, { width: 1000, height: 800 }, 'crop')).toEqual({ width: 400, height: 320 });
  });

  it('does the same for a portrait photograph, about its other side', () => {
    expect(travelPhoto(0, 400, { width: 800, height: 1000 }, 'crop')).toEqual({ width: 400, height: 500 });
    expect(travelPhoto(1, 400, { width: 800, height: 1000 }, 'crop')).toEqual({ width: 320, height: 400 });
  });

  /* Fails against a crop applied to every cover: beyond the bound the page fits too, and nothing eases. */
  it('is fitted throughout where the page already fits it', () => {
    expect(travelPhoto(0, 400, { width: 1200, height: 900 }, 'fit')).toEqual({ width: 400, height: 300 });
    expect(travelPhoto(0.5, 400, { width: 1200, height: 900 }, 'fit')).toEqual({ width: 400, height: 300 });
  });

  it('eases between the two on the travel’s value', () => {
    expect(travelPhoto(0.5, 400, { width: 1000, height: 800 }, 'crop')).toEqual({ width: 450, height: 360 });
  });
});

/* Decided by the build, as the evening's item 2 allows, and written here so a change to either is a change to a test. */
describe('the durations', () => {
  it('are 400ms for the travel at every width and 150ms for the label and controls', () => {
    expect(TRAVEL_MS).toBe(400);
    expect(FADE_MS).toBe(150);
  });
});
