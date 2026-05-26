import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  REMOTE_DISPLAY_NAME_MAX_LENGTH,
  RemoteNameModal
} from '../../../frontend/src/components/screens/RemoteNameModal';

const renderModal = (overrides: Partial<React.ComponentProps<typeof RemoteNameModal>> = {}) => {
  const props: React.ComponentProps<typeof RemoteNameModal> = {
    open: true,
    onSubmit: vi.fn(),
    onClose: vi.fn(),
    ...overrides
  };
  return { props, ...render(<RemoteNameModal {...props} />) };
};

describe('RemoteNameModal', () => {
  it('renders nothing when closed', () => {
    render(<RemoteNameModal open={false} onSubmit={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders the dialog and labelled input when open', () => {
    renderModal();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText(/^name$/i)).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`up to ${REMOTE_DISPLAY_NAME_MAX_LENGTH} characters`, 'i'))
    ).toBeInTheDocument();
  });

  it('disables Join Room while empty and enables when a name is entered', () => {
    renderModal();
    const button = screen.getByRole('button', { name: /join room/i });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: 'Sam' } });
    expect(button).toBeEnabled();
  });

  it('caps input at the configured max length via the maxLength attribute', () => {
    renderModal();
    const input = screen.getByLabelText(/^name$/i) as HTMLInputElement;
    expect(input.maxLength).toBe(REMOTE_DISPLAY_NAME_MAX_LENGTH);
  });

  it('submits the trimmed value on Join Room', () => {
    const { props } = renderModal();
    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: '  Alice  ' } });
    fireEvent.click(screen.getByRole('button', { name: /join room/i }));
    expect(props.onSubmit).toHaveBeenCalledWith('Alice');
  });

  it('does not submit when the value is whitespace only', () => {
    const { props } = renderModal();
    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: '   ' } });
    const button = screen.getByRole('button', { name: /join room/i });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('pre-fills with defaultValue when supplied', () => {
    renderModal({ defaultValue: 'Sam' });
    const input = screen.getByLabelText(/^name$/i) as HTMLInputElement;
    expect(input.value).toBe('Sam');
  });

  it('calls onClose when Escape is pressed', () => {
    const { props } = renderModal();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalled();
  });

  it('submits when Enter is pressed inside the form', () => {
    const onSubmit = vi.fn();
    render(<RemoteNameModal open onSubmit={onSubmit} onClose={vi.fn()} />);
    const input = screen.getByLabelText(/^name$/i);
    fireEvent.change(input, { target: { value: 'Sam' } });
    fireEvent.submit(input.closest('form')!);
    expect(onSubmit).toHaveBeenCalledWith('Sam');
  });
});
