/** @fileoverview Renders the knowledge-first workspace entry page. */

import { SectionPage } from './section-page';
import { homeRoute } from './workspace-routes';

/** Renders the home route using the same stable frame as other workspace sections. */
export default function HomePage() {
  return <SectionPage route={homeRoute} />;
}
