'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { MatchedTextChecks } from '@/lib/db/queries/matched-text';
import { joinSentences, openOnArrival, replaceSentence, sheetSentences } from '@/lib/matched-text/sheet';
import { closeSheet, sheetSaved, sheetState, subscribeSheet, type SheetRequest } from './sheet-store';
import { SheetView } from './SheetView';

/**
 * **§67's correcting sheet, its state over §5.2's matched-text resource (24 Nov).** Mounted once at the root; opens when a
 * reason is pressed in any host (sheet-store). GET reads the effective text and the checks; the text is set out a sentence
 * at a time by the claim check's own rule and the sentence the reason rests on is opened on arrival; a press opens one
 * sentence; Done puts it back; Save writes the whole text through PATCH, which also marks it read, and tells the page so
 * the shelf discards its queue; Clear, drawn only where an edit exists, asks first and returns the generated text through
 * DELETE; a close with a change unsaved asks first. Escape is Close. Closing changes nothing in the run, the field or the
 * drawn answer.
 */
type Loaded = { generated: string | null; edited: string | null; effective: string | null; checks: MatchedTextChecks | null };

async function readText(recordId: string): Promise<Loaded | null> {
  const response = await fetch(`/api/records/${recordId}/matched-text`);
  const body = (await response.json().catch(() => null)) as { data?: Loaded } | null;
  return response.ok && body?.data !== undefined ? body.data : null;
}

export function CorrectingSheetHost() {
  const request = useSyncExternalStore(subscribeSheet, sheetState, () => null);
  return request === null ? null : <CorrectingSheet key={`${request.recordId}|${request.reason}`} request={request} />;
}

function CorrectingSheet({ request }: { request: SheetRequest }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [sentences, setSentences] = useState<string[]>([]);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [dirty, setDirty] = useState(false);
  const [asking, setAsking] = useState<'clear' | 'close' | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* The read, then the apply in its callback: the effect subscribes to the route's answer and sets state when it comes. */
  const apply = useCallback((data: Loaded | null) => {
    if (data === null) { setError('The text could not be read.'); return; }
    const all = sheetSentences(data.effective ?? '');
    const first = openOnArrival(all, request.claims);
    setLoaded(data);
    setSentences(all);
    setOpenIndex(first);
    setDraft(first === null ? '' : all[first]);
    setDirty(false);
  }, [request.claims]);

  useEffect(() => {
    let live = true;
    void readText(request.recordId).then((data) => { if (live) apply(data); });
    return () => { live = false; };
  }, [request.recordId, apply]);

  /* Done on the sentence open: it goes back into the text, an emptied one removed and one typed as two kept as two. */
  const commit = (): string[] => {
    if (openIndex === null) return sentences;
    const next = replaceSentence(sentences, openIndex, draft);
    if (joinSentences(next) !== joinSentences(sentences)) setDirty(true);
    setSentences(next);
    setOpenIndex(null);
    return next;
  };
  const open = (index: number) => {
    const next = commit();
    setOpenIndex(index);
    setDraft(next[index] ?? '');
  };
  const save = async () => {
    const next = commit();
    const text = joinSentences(next);
    if (text.trim() === '') { setError('An empty text cannot be saved; Clear returns the generated one.'); return; }
    const response = await fetch(`/api/records/${request.recordId}/matched-text`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ edited: text }) });
    if (!response.ok) { setError('The correction could not be saved.'); return; }
    sheetSaved(request.recordId);
    closeSheet();
  };
  const clear = async () => {
    const response = await fetch(`/api/records/${request.recordId}/matched-text`, { method: 'DELETE' });
    if (!response.ok) { setError('The edit could not be cleared.'); return; }
    sheetSaved(request.recordId);
    setAsking(null);
    apply(await readText(request.recordId));
  };
  const close = () => {
    const pending = dirty || (openIndex !== null && draft !== (sentences[openIndex] ?? ''));
    if (pending) { setAsking('close'); return; }
    closeSheet();
  };

  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  return (
    <SheetView
      reason={request.reason}
      sentences={sentences}
      openIndex={openIndex}
      draft={draft}
      hasEdit={loaded?.edited != null}
      dirty={dirty || (openIndex !== null && draft !== (sentences[openIndex] ?? ''))}
      checks={loaded?.checks ?? null}
      asking={asking}
      error={error}
      onOpen={open}
      onDraft={setDraft}
      onCommit={() => { commit(); }}
      onSave={() => { void save(); }}
      onClear={() => setAsking('clear')}
      onClose={close}
      onAnswer={(yes) => {
        const was = asking;
        setAsking(null);
        if (!yes) return;
        if (was === 'clear') void clear();
        if (was === 'close') closeSheet();
      }}
    />
  );
}
