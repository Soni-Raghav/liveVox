/**
 * Vitest setup: auto-cleanup React Testing Library renders after each test
 * and install the jest-dom matchers (toBeInTheDocument, ...).
 */
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
