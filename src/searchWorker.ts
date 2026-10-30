import { findMatches, type SearchOptions, type SearchResult } from './searchEngine';
import { markSourceVisibility } from './searchSource';

type Request = { id: number; text: string; options: SearchOptions; replacement: string; source?: boolean };
const worker = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage(message: { id: number; result: SearchResult }): void;
};
worker.onmessage = event => {
  const { id, text, options, replacement, source } = event.data;
  const result = findMatches(text, options, replacement);
  if (source && !result.error && result.matches.length) result.matches = markSourceVisibility(text, result.matches);
  worker.postMessage({ id, result });
};
