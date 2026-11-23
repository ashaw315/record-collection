import { describe, expect, it } from 'vitest';
import { joinSentences, openOnArrival, replaceSentence, sheetSentences } from './sheet';

/**
 * **§67's correcting sheet, the part with no screen (step 3; the coordinator's go, 23 Nov).** "The sheet sets the text out
 * a sentence at a time, and a press on a sentence opens that sentence alone for editing while the others stay as they
 * read." The sentences are the claim check's own, so the sheet and the citations agree on what a sentence is; an emptied
 * sentence is removed, an opened one may be typed as two, and the sentence a reason rests on opens on arrival. Fails
 * against a sheet that splits by its own rule (the abbreviation case), one that keeps an emptied sentence, one that
 * stores a typed-as-two edit as one, and one that opens a sentence the claims do not name.
 */
const TEXT = 'Taped for Vol. 2 in 2019 and shelved. Issued on XL. Side two is quieter, with a duet near its end.';

describe('sheetSentences', () => {
  it('sets the text out by the claim check’s own sentence rule, so "Vol. 2" does not end a sentence', () => {
    expect(sheetSentences(TEXT)).toEqual(['Taped for Vol. 2 in 2019 and shelved.', 'Issued on XL.', 'Side two is quieter, with a duet near its end.']);
  });
});

describe('replaceSentence', () => {
  it('replaces the one sentence opened and leaves the others as they read', () => {
    expect(replaceSentence(sheetSentences(TEXT), 1, 'Issued on XL in 2020.')).toEqual(['Taped for Vol. 2 in 2019 and shelved.', 'Issued on XL in 2020.', 'Side two is quieter, with a duet near its end.']);
  });

  it('removes a sentence emptied, and splits one typed as two', () => {
    expect(replaceSentence(sheetSentences(TEXT), 1, '   ')).toEqual(['Taped for Vol. 2 in 2019 and shelved.', 'Side two is quieter, with a duet near its end.']);
    expect(replaceSentence(sheetSentences(TEXT), 2, 'Side two is quieter. A duet closes it.')).toEqual(['Taped for Vol. 2 in 2019 and shelved.', 'Issued on XL.', 'Side two is quieter.', 'A duet closes it.']);
  });
});

describe('joinSentences', () => {
  it('writes the whole text back with one space between sentences, so saving one corrected sentence changes only that sentence', () => {
    const sentences = sheetSentences(TEXT);
    expect(joinSentences(sentences)).toBe(TEXT);
    expect(joinSentences(replaceSentence(sentences, 1, 'Issued on XL in 2020.'))).toBe('Taped for Vol. 2 in 2019 and shelved. Issued on XL in 2020. Side two is quieter, with a duet near its end.');
  });
});

describe('openOnArrival', () => {
  it('opens the first sentence a claim names, whole, and none where the claims name no sentence of the text', () => {
    const sentences = sheetSentences(TEXT);
    expect(openOnArrival(sentences, ['Issued on XL.'])).toBe(1);
    expect(openOnArrival(sentences, ['Something the text never said.', 'Side two is quieter, with a duet near its end.'])).toBe(2);
    expect(openOnArrival(sentences, ['Issued on'])).toBeNull();
    expect(openOnArrival(sentences, [])).toBeNull();
  });
});
