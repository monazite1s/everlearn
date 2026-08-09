/** @fileoverview Connects the root route to the typed static home composition. */

import { HomePage } from '../features/home/home-page';

/** Renders the default knowledge-first home state without business API calls. */
export default function HomeRoute() {
  return <HomePage />;
}
