import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import Modal from './Modal';

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open dialog</button>
      <Modal open={open} onClose={() => setOpen(false)} ariaLabel="Test dialog">
        <button type="button">First action</button>
        <button type="button">Last action</button>
      </Modal>
    </>
  );
}

test('traps focus, closes on Escape, and restores the opener', () => {
  render(<Harness />);
  const opener = screen.getByRole('button', { name: 'Open dialog' });
  opener.focus();
  fireEvent.click(opener);

  const first = screen.getByRole('button', { name: 'First action' });
  const last = screen.getByRole('button', { name: 'Last action' });
  expect(first).toHaveFocus();

  last.focus();
  fireEvent.keyDown(document, { key: 'Tab' });
  expect(first).toHaveFocus();
  fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
  expect(last).toHaveFocus();

  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(opener).toHaveFocus();
});
