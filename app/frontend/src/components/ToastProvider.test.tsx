import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';
import { useToast } from '../hooks/useToast';
import { ToastProvider } from './ToastProvider';

function Controls(): JSX.Element {
  const { addToast } = useToast();
  return <button onClick={() => addToast('Cambios guardados', 'success')}>Notificar</button>;
}

it('keeps stacked messages readable and removes a dismissed toast after its exit', async () => {
  render(
    <ToastProvider>
      <Controls />
    </ToastProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Notificar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Notificar' }));
  expect(screen.getAllByRole('alert')).toHaveLength(2);
  fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss notification' })[0]);
  await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(1));
  expect(screen.getByRole('alert')).toHaveTextContent('Cambios guardados');
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
});
