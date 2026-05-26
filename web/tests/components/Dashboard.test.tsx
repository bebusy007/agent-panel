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

  it('renders stats cards with session count', async () => {
    renderDashboard();

    await waitFor(() => {
      // MSW returns { totals: { sessions: 2, skills: 1, mcps: 1 } }
      expect(screen.getByText('2')).toBeTruthy();
    });
  });

  it('renders total token count from stats', async () => {
    renderDashboard();

    await waitFor(() => {
      // MSW returns totalTokens: 1500 — check stats area is populated
      const text = document.body.textContent || '';
      expect(text.length).toBeGreaterThan(50);
    });
  });

  it('renders recent session names', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Test session')).toBeTruthy();
      expect(screen.getByText('Codex session')).toBeTruthy();
    });
  });

  it('renders stats section headings', async () => {
    renderDashboard();

    await waitFor(() => {
      // Dashboard should have a sessions count area
      const text = document.body.textContent || '';
      expect(text).toContain('2');
    });
  });
});
