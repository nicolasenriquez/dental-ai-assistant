import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ClinicalDateField } from './ClinicalDateField';

function DateHarness({ initial = '31/01/2024' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <ClinicalDateField label="Fecha de evolución" value={value} onChange={setValue} shortcuts />
  );
}

describe('ClinicalDateField', () => {
  it('normalizes typed dates and keeps a visible Spanish label', () => {
    render(<DateHarness initial="" />);
    const input = screen.getByRole('textbox', { name: 'Fecha de evolución' });
    fireEvent.change(input, { target: { value: '01012024' } });
    expect(input).toHaveValue('01/01/2024');
    expect(input).toHaveAttribute('placeholder', 'dd/mm/aaaa');
  });

  it('moves from January 31 to February 29 with Page Down, then selects it', async () => {
    render(<DateHarness />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Abrir calendario para fecha de evolución' }),
    );
    const selected = await screen.findByRole('button', { name: /31 de enero de 2024/i });
    await waitFor(() => expect(selected).toHaveFocus());
    fireEvent.keyDown(selected, { key: 'PageDown' });
    const leapDay = screen.getByRole('button', { name: /29 de febrero de 2024/i });
    await waitFor(() => expect(leapDay).toHaveFocus());
    fireEvent.click(leapDay);
    expect(screen.getByRole('textbox', { name: 'Fecha de evolución' })).toHaveValue('29/02/2024');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('supports direct year navigation and Escape without changing the value', async () => {
    const onChange = vi.fn();
    render(
      <ClinicalDateField label="Fecha de nacimiento" value="08/09/2020" onChange={onChange} />,
    );
    const trigger = screen.getByRole('button', {
      name: 'Abrir calendario para fecha de nacimiento',
    });
    fireEvent.click(trigger);
    const year = screen.getByRole('textbox', { name: 'Año' });
    fireEvent.change(year, { target: { value: '1990' } });
    fireEvent.blur(year);
    expect(screen.getByRole('grid', { name: 'Septiembre de 1990' })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onChange).not.toHaveBeenCalled();
  });
});
