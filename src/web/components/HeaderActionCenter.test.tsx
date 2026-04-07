// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { HeaderActionCenter } from './HeaderActionCenter';

describe('HeaderActionCenter', () => {
  it('renders action modals outside the header DOM tree', () => {
    render(
      <MemoryRouter>
        <div data-testid="header-host">
          <HeaderActionCenter
            todoItems={[{ id: 'todo-1', label: 'Handle ticket', taskId: 'task-1' }]}
            reviewItems={[]}
          />
        </div>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /To Do/i }));

    const host = screen.getByTestId('header-host');
    const dialog = screen.getByRole('dialog', { name: 'To Do' });

    expect(document.body.contains(dialog)).toBe(true);
    expect(host.contains(dialog)).toBe(false);
  });
});
