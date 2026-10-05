import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import * as api from '../lib/api';
import {
  ClinicalRuntimeProvider,
  useClinicalComposerMemory,
  useOptionalClinicalRuntime,
} from './ClinicalRuntimeProvider';

afterEach(() => vi.restoreAllMocks());

function Probe(): JSX.Element {
  const shared = useOptionalClinicalRuntime();
  const memory = useClinicalComposerMemory();
  const location = useLocation();
  return (
    <>
      <output>{location.pathname}</output>
      <output aria-label="Paciente activo">
        {shared?.controller.thread?.active_patient?.first_name}
      </output>
      <input
        aria-label="Nota sin enviar"
        value={memory?.drafts.a ?? ''}
        onChange={(event) =>
          memory?.setDrafts((current) => ({ ...current, a: event.target.value }))
        }
      />
      <button type="button" onClick={() => void shared?.controller.send('Control')}>
        Enviar
      </button>
      <Link to="/patients/p">Ficha</Link>
      <Link to="/a/a">Regresar</Link>
    </>
  );
}

it('preserves unsent composer memory and detaches transport without cancelling server work', async () => {
  const thread: api.ClinicalThread = {
    id: 'a',
    owner_user_id: 'owner',
    title: 'Consulta',
    active_patient: { id: 'p', first_name: 'Camila', last_name: 'Soto', rut_masked: '•••' },
    pending_action_patient: null,
    active_turn_id: null,
    created_at: '',
    updated_at: '',
    messages: [],
    artifacts: [],
    pending_action: null,
    actions: [],
  };
  vi.spyOn(api, 'getClinicalThread').mockImplementation(async () => ({ ...thread }));
  const cancel = vi.spyOn(api, 'cancelClinicalTurn');
  const storage = vi.spyOn(Storage.prototype, 'setItem');
  let aborted = false;
  vi.spyOn(api, 'streamClinicalTurn').mockImplementation((_id, body, signal) => {
    thread.active_turn_id = body.turn_id;
    return new Promise((_resolve, reject) =>
      signal?.addEventListener('abort', () => {
        aborted = true;
        reject(new DOMException('Subscriber detached', 'AbortError'));
      }),
    );
  });
  const view = render(
    <MemoryRouter initialEntries={['/a/a']}>
      <ClinicalRuntimeProvider>
        <Probe />
      </ClinicalRuntimeProvider>
    </MemoryRouter>,
  );
  await waitFor(() => expect(screen.getByLabelText('Paciente activo')).toHaveTextContent('Camila'));
  fireEvent.change(screen.getByLabelText('Nota sin enviar'), {
    target: { value: 'Nota privada sin enviar' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
  await waitFor(() => expect(api.streamClinicalTurn).toHaveBeenCalledTimes(1));
  const unload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByRole('link', { name: 'Ficha' }));
  await waitFor(() => expect(aborted).toBe(true));
  expect(cancel).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('link', { name: 'Regresar' }));
  expect(screen.getByLabelText('Nota sin enviar')).toHaveValue('Nota privada sin enviar');
  fireEvent.change(screen.getByLabelText('Nota sin enviar'), { target: { value: '' } });
  const cleanUnload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(cleanUnload);
  expect(cleanUnload.defaultPrevented).toBe(false);
  expect(api.streamClinicalTurn).toHaveBeenCalledTimes(1);
  expect(storage).not.toHaveBeenCalled();
  await act(async () => view.unmount());
});
