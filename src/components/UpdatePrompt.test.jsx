/**
 * Unit tests for the PWA update prompt toasts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UpdatePrompt, { OfflineReadyToast } from './UpdatePrompt.jsx';
import { applyUpdate } from '../lib/pwa.js';

vi.mock('../lib/pwa.js', () => ({ applyUpdate: vi.fn() }));

describe('UpdatePrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('announces that a new version is available', () => {
    render(<UpdatePrompt onDismiss={() => {}} />);
    expect(screen.getByText(/new version of LiveVox/i)).toBeInTheDocument();
  });

  it('activates the waiting worker when Reload is clicked', async () => {
    const user = userEvent.setup();
    render(<UpdatePrompt onDismiss={() => {}} />);
    await user.click(screen.getByRole('button', { name: /reload/i }));
    expect(applyUpdate).toHaveBeenCalledTimes(1);
  });

  it('can be dismissed without updating', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<UpdatePrompt onDismiss={onDismiss} />);
    await user.click(screen.getByRole('button', { name: /dismiss update/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(applyUpdate).not.toHaveBeenCalled();
  });
});

describe('OfflineReadyToast', () => {
  it('confirms offline readiness', () => {
    render(<OfflineReadyToast onDismiss={() => {}} />);
    expect(screen.getByText(/ready to work offline/i)).toBeInTheDocument();
  });
});
