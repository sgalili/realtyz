// Import this once from the existing Railway Node startup (with a TypeScript loader).
// Keeps the existing HTTP service and start command intact.
import { startImportWorker } from './index.ts';

void startImportWorker().catch(error => {
  // A worker configuration failure must not take down the existing Production web server.
  console.error('TORAFF import worker could not start:', (error as Error).message);
});