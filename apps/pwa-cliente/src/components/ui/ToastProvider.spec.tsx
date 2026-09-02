// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ToastProvider, useToast } from './ToastProvider';

const TestComponent = () => {
  const { toast } = useToast();
  return (
    <div>
      <button onClick={() => toast({ title: 'Title1', msg: 'Msg1' })}>Ok Toast</button>
      <button onClick={() => toast({ title: 'TitleErr', kind: 'err', icon: 'Alert' })}>Err Toast</button>
    </div>
  );
};

const ThrowComponent = () => {
  useToast();
  return null;
};

describe('ToastProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('throws if useToast is used outside provider', () => {
    const originalError = console.error;
    console.error = vi.fn();
    expect(() => render(<ThrowComponent />)).toThrow('useToast debe usarse dentro de <ToastProvider>');
    console.error = originalError;
  });

  it('renders toasts and removes them after timeout', () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('Ok Toast'));
    expect(screen.getByText('Title1')).toBeInTheDocument();
    expect(screen.getByText('Msg1')).toBeInTheDocument();
    
    // check role="status"
    const statusToast = screen.getByRole('status');
    expect(statusToast).toHaveClass('ok');

    fireEvent.click(screen.getByText('Err Toast'));
    expect(screen.getByText('TitleErr')).toBeInTheDocument();
    
    // check role="alert"
    const alertToast = screen.getByRole('alert');
    expect(alertToast).toHaveClass('err');

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.queryByText('Title1')).not.toBeInTheDocument();
    expect(screen.queryByText('TitleErr')).not.toBeInTheDocument();
  });

  it('funciona por HTTP LAN aunque crypto.randomUUID no exista', () => {
    vi.stubGlobal('crypto', { getRandomValues: vi.fn() });
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    expect(() => fireEvent.click(screen.getByText('Ok Toast'))).not.toThrow();
    expect(screen.getByText('Title1')).toBeInTheDocument();
  });
});
