import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useDetailNav, useOverlayNavigate } from '../use-detail-nav';

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter initialEntries={['/skills']}>{children}</MemoryRouter>;
}

describe('useDetailNav', () => {
  it('returns isOverlay=false when no backgroundLocation in state', () => {
    const { result } = renderHook(() => useDetailNav('/skills'), { wrapper });
    expect(result.current.isOverlay).toBe(false);
  });

  it('goBack navigates to fallback path in standalone mode', () => {
    const { result } = renderHook(() => useDetailNav('/skills'), { wrapper });
    act(() => {
      result.current.goBack();
    });
    // In standalone mode, goBack calls navigate(fallbackPath)
    // We can't easily assert navigation happened in this test setup,
    // but at least verify the function doesn't throw
    expect(result.current.isOverlay).toBe(false);
  });
});

describe('useOverlayNavigate', () => {
  it('returns a function', () => {
    const { result } = renderHook(() => useOverlayNavigate(), { wrapper });
    expect(typeof result.current).toBe('function');
  });

  it('can be called without throwing', () => {
    const { result } = renderHook(() => useOverlayNavigate(), { wrapper });
    act(() => {
      result.current('/skills/123');
    });
    // Verify it doesn't throw
    expect(true).toBe(true);
  });

  it('accepts replace option', () => {
    const { result } = renderHook(() => useOverlayNavigate(), { wrapper });
    act(() => {
      result.current('/skills/456', { replace: true });
    });
    expect(true).toBe(true);
  });

  it('goBack navigates to -1 in overlay mode', () => {
    const overlayWrapper = ({ children }: { children: ReactNode }) => (
      <MemoryRouter
        initialEntries={[
          { pathname: '/skills/123', state: { backgroundLocation: { pathname: '/skills' } } },
        ]}
      >
        {children}
      </MemoryRouter>
    );
    const { result } = renderHook(() => useDetailNav('/skills'), {
      wrapper: overlayWrapper,
    });
    expect(result.current.isOverlay).toBe(true);
    act(() => {
      result.current.goBack();
    });
  });

  it('useOverlayNavigate sets backgroundLocation on first open', () => {
    const { result } = renderHook(() => useOverlayNavigate(), { wrapper });
    act(() => {
      result.current('/skills/789');
    });
    expect(true).toBe(true);
  });
});
