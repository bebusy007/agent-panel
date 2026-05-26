import { beforeAll, afterEach, afterAll } from 'vitest';
import { cleanup } from '@testing-library/react';
import { server } from './msw/server';
import { resetState } from './msw/state';

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'bypass' });
});

afterEach(() => {
  cleanup();
  resetState();
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
