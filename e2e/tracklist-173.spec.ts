import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { releaseText } from '../src/lib/discogs/release-text';
import { NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';
import { registerCleanup, trackArtist, trackSavedRecord } from './cleanup';
import { seedRelease, seedReleaseFixture } from './seed';
import { login } from './sign-in';

/**
 * **173c (§65, "Credits fold" 7 Nov, "Credits by role and the count line" 8 Nov): the TRACKLIST section on the page.**
 * The section component is 173b's and has its own tests; these read the built page. The count line both ways, as the
 * step asks: a seeded release with unshown companies and no credits draws it, and one whose companies are all shown
 * (as the record's label and the pressing's plant) draws none. A fixture release for the rest: the section directly after
 * Pressing detail's, the tracks whole, the fold closed on load and the count line its summary, the order opened, two
 * track columns at 1440 and 960 and one at 480 and 390. A record with no cached release draws no section (§65, §38).
 * Every release is seeded under an id of the run's own, and every artist and record is tracked.
 */
registerCleanup();
test.beforeEach(async ({ page }) => login(page));

/* A reference row posted twice in one run answers 409 with the existing id, which is the id wanted. */
const post = async (page: Page, path: string, data: unknown): Promise<{ id: string }> => { const j = (await (await page.request.post(path, { data })).json()) as { id?: string; error?: { existingId?: string } }; return { id: j.id ?? j.error?.existingId ?? '' }; };
const releaseId = () => 900_000_000 + Math.floor(Math.random() * 90_000_000);

/** A record on a pressing holding the release, under its own artist; the label and plant are what the page shows. */
async function recordHolding(page: Page, suffix: string, release: number | null, shown: { label?: string; plant?: string } = {}): Promise<string> {
  const artist = await post(page, '/api/artists', { name: `Tracklist Artist ${suffix}` });
  trackArtist(artist.id);
  const label = shown.label === undefined ? null : await post(page, '/api/labels', { name: shown.label });
  /* A weight, a fact the band's cells do not carry, so Pressing detail's section renders and the tracklist's place after it is a real one. */
  const pressing = await post(page, '/api/pressings', { catalogNumber: `TL-${suffix}`, vinylWeightGrams: 180, ...(release === null ? {} : { discogsReleaseId: release }), ...(shown.plant === undefined ? {} : { pressingPlant: shown.plant }) });
  const record = await post(page, '/api/records', { title: `Tracklist Record ${suffix}`, artistId: artist.id, pressingId: pressing.id, ...(label === null ? {} : { labelId: label.id }) });
  await trackSavedRecord(page, record.id);
  return record.id;
}

const twoTracks = { tracklist: [{ position: 'A', title: 'Side One' }, { position: 'B', title: 'Side Two' }] };

test('the count line both ways: unshown companies with no credits draw it, companies all shown draw none', async ({ page }) => {
  const suffix = Date.now().toString(36);
  const unshown = releaseId();
  await seedRelease(unshown, { ...twoTracks, companies: [{ name: `Orlake Records ${suffix}`, entity_type_name: 'Pressed By' }] });
  const drawn = await recordHolding(page, `${suffix}-a`, unshown, { label: `Clay Records ${suffix}` });
  await page.goto(`/records/${drawn}`);
  const section = page.locator('[data-section="tracklist"]');
  await expect(section).toBeVisible();
  await expect(section.locator('details > summary'), 'the fold holds one company, so the line is drawn').toHaveText(/Credits · 1/);
  await expect(section.locator('details')).not.toHaveAttribute('open', /.*/);

  const shown = releaseId();
  await seedRelease(shown, { ...twoTracks, companies: [{ name: `Clay Records ${suffix}`, entity_type_name: 'Label' }, { name: `Orlake Records ${suffix}`, entity_type_name: 'Pressed By' }] });
  const none = await recordHolding(page, `${suffix}-b`, shown, { label: `Clay Records ${suffix}`, plant: `Orlake Records ${suffix}` });
  await page.goto(`/records/${none}`);
  const bare = page.locator('[data-section="tracklist"]');
  await expect(bare).toBeVisible();
  await expect(bare.locator('li').filter({ hasText: 'A · Side One' })).toBeVisible();
  await expect(bare.locator('details'), 'both companies are shown as label and plant, so the fold would hold nothing').toHaveCount(0);
  await expect(bare).not.toContainText('Credits');
});

test('a record with no cached release draws no TRACKLIST section', async ({ page }) => {
  const id = await recordHolding(page, `${Date.now().toString(36)}-n`, null);
  await page.goto(`/records/${id}`);
  await expect(page.locator('[data-section="pressing-detail"]')).toBeVisible();
  await expect(page.locator('[data-section="tracklist"]')).toHaveCount(0);
});

for (const [width, columns] of [[1440, 2], [960, 2], [480, 1], [390, 1]] as const) {
  test(`at ${width}: directly after Pressing detail, the tracks whole in ${columns} column${columns === 1 ? '' : 's'}, the fold closed behind the count line, and opened in order`, async ({ page }) => {
    /* 8a's budget, imported and not typed, as every spec that drives the record screen does (test/repo/specs-import-constants). */
    await page.setViewportSize({ width, height: NO_SCROLL_HEIGHT });
    const release = releaseId();
    /* A release with credits of both kinds and companies (release-detailed has release credits only, so its fold has no track block). */
    await seedReleaseFixture(release, 'release-gatefold-c');
    const fixture = releaseText(JSON.parse(readFileSync('test/fixtures/discogs/release-gatefold-c.json', 'utf8')) as unknown).filter((r) => r.kind === 'track');
    const id = await recordHolding(page, `${Date.now().toString(36)}-${width}`, release, { label: 'A&M Records' });
    await page.goto(`/records/${id}`);
    const section = page.locator('[data-section="tracklist"]');
    await expect(section).toBeVisible();
    const order = await page.evaluate(() => Array.from(document.querySelectorAll('[data-section]')).map((s) => s.getAttribute('data-section')));
    expect(order.indexOf('tracklist'), 'directly after Pressing detail').toBe(order.indexOf('pressing-detail') + 1);
    const tracks = section.locator('[data-tracks] li');
    await expect(tracks, 'every track the release holds').toHaveCount(fixture.length);
    await expect(tracks.first()).toHaveText(`${fixture[0].detail} · ${fixture[0].text}`);
    const cols = await section.locator('[data-tracks]').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length);
    expect(cols, `the tracks grid's columns at ${width}`).toBe(columns);
    const details = section.locator('details');
    await expect(details).not.toHaveAttribute('open', /.*/);
    await expect(details.locator('summary')).toHaveText(/^Credits · \d+/);
    await details.locator('summary').click();
    await expect(details).toHaveAttribute('open', /.*/);
    const releaseLines = details.locator('[data-credits="release"] li');
    await expect(releaseLines.first()).toBeVisible();
    const releaseBottom = await releaseLines.last().evaluate((el) => el.getBoundingClientRect().bottom);
    const firstTrackTop = await details.locator('[data-credits="track"]').first().evaluate((el) => el.getBoundingClientRect().top);
    expect(firstTrackTop, 'the release’s credits stand before the tracks’').toBeGreaterThanOrEqual(releaseBottom);
  });
}
