import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { STButton } from '../../../frontend/src/components/brand/primitives';

describe('STButton', () => {
  it('defaults to type="button"', () => {
    const { getByRole } = render(<STButton>Go</STButton>);
    expect(getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('forwards type="submit"', () => {
    const { getByRole } = render(<STButton type="submit">Go</STButton>);
    expect(getByRole('button')).toHaveAttribute('type', 'submit');
  });
});
