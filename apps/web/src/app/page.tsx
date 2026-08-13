/** @fileoverview Connects the root route to the knowledge-first home composition. */

import { HomePage } from '../features/home/home-page';

/** Renders the default knowledge-first home state from public API data. */
export default function HomeRoute() {
  return <HomePage />;
}
