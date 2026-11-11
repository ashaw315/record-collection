# manage-exits-174 · every exit the page owns asks (§T.6, step 174), captured 2026-11-11

From the build (E2E_SERVER=build) at 390 × 844 under a coarse pointer. A store row open with its city changed, then each
exit the page owns pressed, and the row's one line asking, DISCARD CHANGES and KEEP EDITING, before anything moves.

| exit | how it was pressed | file |
|---|---|---|
| a change of section | the Resource navigation's Tags | section-change-390-asked.png |
| a link in the app | the header's Menu, then Want list; the menu closes so the line shows | link-in-the-app-390-asked.png |
| Back | the browser's Back, over the entry opening the row added | back-390-asked.png |

The three stills are byte-identical, and that is the ruling seen: every exit asks with the same line in the same place,
and a still cannot show which exit was pressed, so the spec asserts that (`e2e/manage.spec.ts`, "174: every exit the
page owns asks"). The browser's own exit, the unload prompt on closing or reloading the tab, is the browser's dialog and
not the page's to draw, so it has no capture; the spec asserts it is bound while the form has changes and not otherwise.
