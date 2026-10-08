import { test, expect } from '@playwright/test';
import { getTestDb } from '../../test/helpers/db';
import { sql } from 'drizzle-orm';
import { seedImage, seedRecordWithId } from '../seed';
import { trackArtist } from '../cleanup';
import { NO_SCROLL_HEIGHT } from '../../src/app/records/[id]/band-geometry';
import { login } from '../sign-in';

/**
 * **§33 rendered, which it has not been.**
 *
 * §33 reverses clauses in five sections and withdrew its own 1.5x cap on the
 * strength of one screenshot, and none of it had been drawn: the title steps,
 * the per-record construction fit, the cover flush to its cell, the journal in
 * the last cell, the resized matrix solid and the whole-row rules.
 *
 * ## Fixture provenance, stated because §27 requires it and nothing enforces it
 *
 * §27: fixtures derive from the collection's measured extremes, from one
 * shared file. `real-records.ts` holds the seventeen IDS and nothing else, so
 * every displayed FIELD below is hand-entered and traces to a source named
 * here rather than to that file.
 *
 * | what | source | in the shared file? |
 * |---|---|---|
 * | `Loss Of Life` / `MGMT` | §33's own worked example | no -- Design-stated |
 * | `On The Radio: Greatest Hits Vol. 1 & 2` / `Donna Summer` | the collection's worst title, from Adam's capture of the built page | no -- by eye |
 * | pressing line, matrix string, prices | transcribed from Adam's 1440 x 900 capture | no |
 * | note, snippet, journal entry | written for this capture | no |
 * | the 1.396x construction | `REAL_RECORD_IDS` | **yes** |
 *
 * **This is the fifth fixture artifact of the session**, after the isolation
 * suffix rendering on the page, reused pressing data, the dev badge, and the
 * one-pixel cover reading as an empty cell. The fourth was mine this round: a
 * five-line title INVENTED at twice the length of any real one, which
 * overflowed its cell and was reported as a build defect until it was checked
 * against the pre-change capture. The title above is the collection's actual
 * worst, and it fits.
 *
 * Until §27 is made assertable, the discipline is this table: no displayed
 * field enters a capture without a named source, and "I typed something
 * plausible" is not one.
 *
 * ## The three records
 *
 * | record | why |
 * |---|---|
 * | Loss Of Life | §33's worked example -- "144 fails by about 15px, so it takes 120 over two lines, with about 68px of gap" |
 * | the worst title | the case that stays at 72, where the give order runs and nothing steps up |
 * | the biggest gain | NOT CAPTURED -- see below |
 *
 * **The third record is not in these captures, and the comment that said it
 * was on the construction sheet was wrong.** The sheet draws the records the
 * database holds, which here are the two this capture seeds -- not the
 * seventeen extremes. `158a3163...c724` gains most (1.644x with the pad
 * removed), and its drawing is a function of its id, so capturing it needs a
 * row with that id; four foreign keys refuse a late id rewrite. Seeding it at
 * INSERT time is the fix and is not built.
 */
/**
 * The extremes fixture's largest gain under §33's per-record fit, captured on
 * the construction sheet — it is an id, and a construction is a function of
 * its id alone.
 */
const BIGGEST_GAIN_ID = '158a3163-6a56-4673-8f88-27e7b2aec724';

/**
 * How long to let the client-measured marks settle before a shot -- the
 * construction and the matrix solid both size themselves after paint.
 *
 * **750, not 900.** The repo guard reads a bare `900` in a record-screen spec
 * as `NO_SCROLL_HEIGHT` typed inline, and it is right to: the two meanings
 * share a number and only one is a viewport. Writing `800 + 100` would slip
 * past the guard while keeping the collision, which is worse than the thing
 * the guard is for. A different number is the honest fix, and the wait is a
 * settle rather than a measured threshold.
 */
const SETTLE_MS = 750;

test('capture §33: three records at 1440', async ({ page }) => {
  test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
  test.setTimeout(240_000);

  await login(page);

  /*
    **The status is checked.** Without it a 400 returns a body with no `id`,
    every later query interpolates `undefined`, and the failure surfaces as
    `WHERE id = ::uuid` -- a syntax error naming a statement that is correct,
    three calls downstream of the one that actually broke.
  */
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(path, { data });
    expect(response.status(), `POST ${path}: ${await response.text()}`).toBeLessThan(300);
    return response.json();
  };

  /*
    **Reference rows are shared, so creating one twice is a DUPLICATE, not an
    error.** The three records share a label, a format and six genres; the
    second record's POST returns 409 with the existing id, which is the
    endpoint working as §7 rules. Reusing it is what a real second record on
    the same label does.

    Without this the first collision returned a body with no `id`, and the
    failure surfaced three calls later as `WHERE id = ::uuid` -- a syntax
    error naming a statement that was correct.
  */
  const findOrCreate = async (path: string, data: unknown) => {
    const response = await page.request.post(path, { data });
    if (response.status() === 409 || response.status() === 200 || response.status() === 201) {
      const body = await response.json();
      const id = (body.id ?? body.error?.existingId) as string | undefined;
      expect(id, `POST ${path} gave no id: ${JSON.stringify(body)}`).toBeTruthy();
      return { id: id as string };
    }
    expect(response.status(), `POST ${path}: ${await response.text()}`).toBeLessThan(300);
    return response.json();
  };

  /*
    **No isolation suffix on anything the page displays** — §27's rule, and
    worse in a capture: a suffixed artist renders on the screenshot and Adam
    judges type he will never ship.
  */
  const seed = async ({
    title,
    artistName,
    id: wantedId,
  }: {
    title: string;
    artistName: string;
    /** A real record's id, so its construction is the one that record draws. */
    id?: string;
  }) => {
    const artist = await findOrCreate('/api/artists', { name: artistName });
    trackArtist(artist.id as string);
    const label = await findOrCreate('/api/labels', { name: 'Mom + Pop' });
    const pressing = await post('/api/pressings', {
      catalogNumber: 'MP731',
      yearPressed: 2024,
      countryPressed: 'UK, Europe & US',
      pressingPlant: 'GZ Media',
      colorVariant: 'Orange [Tangerine]',
      matrixRunout: '269346E1 1701690 MP731-A JN-H STERLING',
    });
    const format = await findOrCreate('/api/formats', { name: 'Vinyl, LP, Album' });
    const genreIds: string[] = [];
    for (const name of ['Electronic', 'Indie Pop', 'Indie Rock', 'Pop', 'Psychedelic Rock', 'Rock']) {
      genreIds.push((await findOrCreate('/api/genres', { name })).id);
    }
    let id: string;
    if (wantedId === undefined) {
      const record = await post('/api/records', {
        title,
        artistId: artist.id,
        labelId: label.id,
        pressingId: pressing.id,
        formatId: format.id,
        genreIds,
        releaseYear: 2024,
      });
      id = record.id as string;
    } else {
      /*
        **Named, so the construction is that record's own.** A drawing is a
        function of its id alone, so photographing the record that gains most
        under §33 means a row carrying its id -- which the API cannot give and
        an UPDATE cannot reach, four foreign keys refusing it.
      */
      id = await seedRecordWithId({
        id: wantedId,
        artistId: artist.id as string,
        title,
        labelId: label.id as string,
        pressingId: pressing.id as string,
        formatId: format.id as string,
        releaseYear: 2024,
        genreIds,
      });
    }


    /*
      **The construction depends only on the id**, so the record that gains
      most can only be captured by giving the row that id.

      Set BEFORE any child row exists, not by rewriting it afterwards.
      `images`, `price_history` and the journal all carry a foreign key to
      `records.id`, so a late UPDATE of the key is refused outright --
      "violates foreign key constraint images_record_id_records_id_fk" -- and
      reordering it after the children would orphan them instead.
    */
    await seedImage({ recordId: id, imageType: 'cover' });
    await getTestDb().execute(sql`
      UPDATE records SET
        spine_colour = ${'#a25829'},
        notes = ${'Bought on the Saturday. Sleeve is clean.'},
        snippet = ${'The record where the machinery starts to sound like a band.'},
        snippet_edited_at = NOW()
      WHERE id = ${id}::uuid`);
    await page.request.post(`/api/records/${id}/journal`, {
      data: { entryDate: '2026-09-20', note: 'Played it right through. The second side is the one.' },
    });
    for (const [price, source] of [['12.99', 'Rough Trade'], ['13.42', 'Discogs']] as const) {
      const posted = await page.request.post(`/api/records/${id}/prices`, {
        data: { price, priceType: 'used', source },
      });
      expect(posted.status(), `the price seeded: ${await posted.text()}`).toBe(201);
    }
    return id;
  };

  const shots: Array<{ id: string; name: string }> = [];

  /* 1. §33's own worked example. */
  shots.push({
    id: await seed({ title: 'Loss Of Life', artistName: 'MGMT' }),
    name: 'loss-of-life',
  });

  /*
    2. The five-line worst title, which §33 says "stays at 72" — the case
    where no step fits and §4.2's give order runs instead.
  */
  shots.push({
    id: await seed({
      /*
        **The collection's actual worst title**, the one §33 says "stays at
        72" -- not a longer invented one. A title twice its length sets to
        more lines than any record has and would test a case the collection
        does not contain.
      */
      title: 'On The Radio: Greatest Hits Vol. 1 & 2',
      artistName: 'Donna Summer',
    }),
    name: 'worst-title-five-lines',
  });

  /* 3. The drawing that grows most under §33 -- now seeded by its real id. */
  shots.push({
    id: await seed({
      title: 'Music Has The Right To Children',
      artistName: 'Boards Of Canada',
      id: BIGGEST_GAIN_ID,
    }),
    name: 'biggest-gain-1.644x',
  });

  /*
    (superseded note) The drawing that grows most under §33 is `158a3163…c724`,
    and a construction depends only on its id -- so it cannot be seeded into
    a fresh record without rewriting `records.id`, which four foreign keys
    refuse. The construction SHEET draws every record's still from its own
    id, so the biggest gainer is captured there, beside the rest for scale.
  */

  await page.setViewportSize({ width: 1440, height: NO_SCROLL_HEIGHT });

  /*
    The construction sheet: every still drawn from its record's id at §33's
    per-record fit. It shows the records the DATABASE holds, which is the two
    seeded above -- `${BIGGEST_GAIN_ID.slice(0, 8)}` is not among them.
  */
  await page.goto('/wall/probe/sheet');
  await page.locator('[data-sheet-tile]').first().waitFor({ timeout: 15_000 });
  await page.waitForTimeout(SETTLE_MS);
  await page.screenshot({ path: 'docs/captures/step29-construction-sheet-1440.png', fullPage: true });

  for (const shot of shots) {
    await page.goto(`/records/${shot.id}`);
    await expect(page.locator('[data-field="eyebrow"]')).toBeVisible();
    /* The construction and the matrix solid both measure at render. */
    await page.waitForTimeout(SETTLE_MS);

    /*
      **Measured beside the picture, so the caption is a number and not a
      reading of the image.** §33's worked example for Loss Of Life: "144
      fails by about 15px, so it takes 120 over two lines, with about 68px of
      gap." The step, the line count and the gap are read off the render.
    */
    const measured = await page.evaluate(() => {
      const px = (n: number) => Math.round(n * 10) / 10;
      const title = document.querySelector('[data-field="title"]') as HTMLElement | null;
      const artist = document.querySelector('[data-field="artist"]') as HTMLElement | null;
      const block = document.querySelector('[data-block="pressing"]') as HTMLElement | null;
      const cell = document.querySelector('[data-cell="identity"]') as HTMLElement | null;
      if (title === null || artist === null || block === null || cell === null) return null;
      const size = parseFloat(getComputedStyle(title).fontSize);
      const t = title.getBoundingClientRect();
      const a = artist.getBoundingClientRect();
      const b = block.getBoundingClientRect();
      const c = cell.getBoundingClientRect();
      /*
        The whole y-stack, so "gap" is a named pair of edges and not a chosen
        one: the artist's foot to the pressing block's head (the 372 hairline
        is the block's top border), and the block's foot to the cell's.
      */
      return {
        step: size,
        lines: Math.round(t.height / (size * 0.94)),
        artist: parseFloat(getComputedStyle(artist).fontSize),
        artistH: px(a.height),
        artistFootToHairline: px(b.top - a.bottom),
        blockH: px(b.height),
        blockFootToCellFoot: px(c.bottom - b.bottom),
        cellH: px(c.height),
      };
    });
    console.log(`MEASURED ${shot.name}: ${JSON.stringify(measured)}`);

    await page.screenshot({
      path: `docs/captures/step29-${shot.name}-1440x${NO_SCROLL_HEIGHT}.png`,
      fullPage: true,
    });
    /* The upper band alone, where the title steps and the cover change. */
    await page.screenshot({
      path: `docs/captures/step29-${shot.name}-1440-band.png`,
      clip: { x: 0, y: 0, width: 1440, height: 640 },
    });
  }
});
