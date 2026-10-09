import type { Page } from '@playwright/test';
import sharp from 'sharp';

/**
 * Reading what the browser painted, for a claim that something is drawn ON
 * TOP: a tap proves a layer takes input and a pixel proves it is painted
 * above, and the two can come apart (§G.8, step 84). `nav-menu-84.spec.ts`
 * has its own copies of these, from before this file; step 101 is the
 * second use and takes them from here.
 */

/** Paper as a painted pixel: the body's background, drawn and read back. */
export const paperRgb = (page: Page): Promise<number[]> =>
  page.evaluate(() => {
    const k = document.createElement('canvas'); k.width = 1; k.height = 1;
    const x = k.getContext('2d') as CanvasRenderingContext2D;
    x.fillStyle = getComputedStyle(document.body).backgroundColor; x.fillRect(0, 0, 1, 1);
    return Array.from(x.getImageData(0, 0, 1, 1).data.slice(0, 3));
  });

/** One pixel of the page as the browser drew it. */
export async function pixelAt(page: Page, x: number, y: number): Promise<number[]> {
  const shot = await page.screenshot({ clip: { x: Math.round(x), y: Math.round(y), width: 1, height: 1 } });
  const { data } = await sharp(shot).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return [data[0], data[1], data[2]];
}

export const near = (a: number[], b: number[], tol = 3): boolean => a.every((v, i) => Math.abs(v - b[i]) <= tol);
