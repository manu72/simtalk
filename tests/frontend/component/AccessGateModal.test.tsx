import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AccessGateModal } from '../../../frontend/src/components/screens/AccessGateModal';

const renderModal = (overrides: Partial<React.ComponentProps<typeof AccessGateModal>> = {}) => {
  const props: React.ComponentProps<typeof AccessGateModal> = {
    open: true,
    errorMessage: null,
    onSubmit: vi.fn(),
    onClose: vi.fn(),
    ...overrides
  };
  return { props, ...render(<AccessGateModal {...props} />) };
};

describe('AccessGateModal', () => {
  it('renders nothing when closed', () => {
    render(
      <AccessGateModal
        open={false}
        errorMessage={null}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders the title and password input when open', () => {
    renderModal();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('disables Continue while the input is empty and enables when filled', () => {
    renderModal();
    const button = screen.getByRole('button', { name: /continue/i });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'hunter2' } });
    expect(button).toBeEnabled();
  });

  it('calls onSubmit with the trimmed password on Continue', () => {
    const { props } = renderModal();
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: '  hunter2  ' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(props.onSubmit).toHaveBeenCalledWith('hunter2');
  });

  it('calls onClose when Escape is pressed', () => {
    const { props } = renderModal();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalled();
  });

  it('renders the error message when provided', () => {
    renderModal({ errorMessage: 'Incorrect password. Try again.' });
    expect(screen.getByText('Incorrect password. Try again.')).toBeInTheDocument();
  });

  it('submits when Enter is pressed in the password field', async () => {
    const onSubmit = vi.fn();
    render(
      <AccessGateModal
        open
        errorMessage={null}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />
    );
    const input = screen.getByLabelText(/password/i);
    fireEvent.change(input, { target: { value: 'hunter2' } });
    fireEvent.submit(input.closest('form')!);
    expect(onSubmit).toHaveBeenCalledWith('hunter2');
  });
});
