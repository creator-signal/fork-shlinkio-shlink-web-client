import { screen } from '@testing-library/react';
import { fromPartial } from '@total-typescript/shoehorn';
import { MemoryRouter } from 'react-router';
import type { ServersMap } from '../../src/servers/data';
import { ServersDropdown } from '../../src/servers/ServersDropdown';
import { checkAccessibility } from '../__helpers__/accessibility';
import { renderWithStore } from '../__helpers__/setUpTest';

describe('<ServersDropdown />', () => {
  const fallbackServers: ServersMap = {
    '1a': fromPartial({ name: 'foo', id: '1a' }),
    '2b': fromPartial({ name: 'bar', id: '2b' }),
    '3c': fromPartial({ name: 'baz', id: '3c' }),
  };
  const setUp = (servers: ServersMap = fallbackServers) =>
    renderWithStore(
      <MemoryRouter>
        <ul role="menu">
          <ServersDropdown />
        </ul>
      </MemoryRouter>,
      {
        initialState: { selectedServer: null, servers },
      },
    );

  it('passes a11y checks', async () => {
    const { user, ...rest } = setUp();
    // Open menu
    await user.click(screen.getByText('Servers'));

    return checkAccessibility(rest);
  });

  it('contains only the fixed server list', async () => {
    const { user } = setUp();

    await user.click(screen.getByText('Servers'));
    const items = screen.getAllByRole('menuitem');

    // The outer navbar dropdown itself also has menuitem semantics.
    expect(items).toHaveLength(Object.values(fallbackServers).length + 1);
    expect(items[1]).toHaveTextContent('foo');
    expect(items[2]).toHaveTextContent('bar');
    expect(items[3]).toHaveTextContent('baz');
  });

  it('contains a toggle with proper text', () => {
    setUp();
    expect(screen.getByRole('button')).toHaveTextContent('Servers');
  });

  it('does not expose server creation when the session is still loading', async () => {
    const { user } = setUp({});

    await user.click(screen.getByText('Servers'));
    expect(screen.getAllByRole('menuitem')).toHaveLength(1);
    expect(screen.queryByText(/Add a server/i)).not.toBeInTheDocument();
  });
});
