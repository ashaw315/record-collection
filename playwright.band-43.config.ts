import base from './playwright.config';

/*
  Step 171's CI run (.github/workflows/band-43.yml; the coordinator, 8 Nov): the main config with the capture project
  listed FIRST. Playwright hands out work in project order, so under the main config the measurement ran as the last
  of 1066 tests, in the run's quiet tail (42549436884: 357 loads clean, finishing last). Listed first, a worker picks
  it up at the start, and BAND43_FOR_MIN keeps it measuring through the suite; each load records its time and the
  machine's load, so where it ran is read, not assumed. Everything else is the main config's.
*/
const projects = base.projects ?? [];
export default {
  ...base,
  projects: [...projects.filter((p) => p.name === 'capture'), ...projects.filter((p) => p.name !== 'capture')],
};
