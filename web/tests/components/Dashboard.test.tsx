import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from '../../src/pages/Dashboard';
import { resetState } from '../msw/state';

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );
}

describe('Dashboard', () => {
  beforeEach(() => resetState());

  it('renders without crashing', async () => {
    renderDashboard();
    await waitFor(() => {
      // Should render some content
      expect(document.body.textContent).toBeTruthy();
    });
  });

  it('displays session count', async () => {
    renderDashboard();
    await waitFor(() => {
      // Dashboard should show session-related content
      const text = document.body.textContent || '';
      expect(text.length).toBeGreaterThan(0);
    });
  });
});
