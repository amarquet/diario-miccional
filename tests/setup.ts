import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom não implementa scrollTo.
window.scrollTo = () => undefined;

afterEach(() => {
  cleanup();
  location.hash = '';
  sessionStorage.clear();
});
