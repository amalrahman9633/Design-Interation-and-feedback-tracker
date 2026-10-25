import { repo } from '../store/repo';
import type { CommentAnchor } from '../store/types';
import { normaliseUrl } from './format';

// Local dev serves the demo on its own port; deployments serve it at /demo/.
export const DEMO_URL = normaliseUrl(location.hostname === 'localhost' ? 'localhost:5174' : `${location.origin}/demo/`);

/** The route the SDK reports for the demo's page, e.g. "/" locally or "/demo/" when deployed. */
const DEMO_ROUTE = new URL(DEMO_URL).pathname;

// Sample feedback so the demo opens with something to look at. Anchored to
// elements the demo marks with data-organiser-id; x/y are the fallback spot
// (in % of the frame) if the SDK isn't connected.
const SAMPLE_COMMENTS: { body: string; anchor: Omit<CommentAnchor, 'route'> }[] = [
  {
    body: 'Change the banner. The abstract shapes don’t say anything about the product; try a screenshot of the app instead.',
    anchor: { mode: 'element', selector: '[data-organiser-id="panel"]', offsetX: 0.5, offsetY: 0.35, x: 25, y: 35, variant: 'Static', stateValues: { form: 'Empty' } },
  },
  {
    body: 'Increase the H1. “Welcome back” gets lost next to the banner; try 44px.',
    anchor: { mode: 'element', selector: '[data-organiser-id="heading"]', offsetX: 0.62, offsetY: 0.15, x: 62, y: 18, variant: 'Static', stateValues: { form: 'Empty' } },
  },
];

/** Creates the demo project with its sample comments and returns the version to open. */
export async function createDemoProject() {
  const { version } = await repo.createProject({
    name: 'Demo: login page',
    url: DEMO_URL,
    note: 'Two variants of the login page (Static and Carousel) with Empty, Filled and Error states.',
  });
  for (const sample of SAMPLE_COMMENTS) {
    await repo.addComment(version.id, { ...sample.anchor, route: DEMO_ROUTE }, sample.body);
  }
  return version;
}
