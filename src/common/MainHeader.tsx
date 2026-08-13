import { faCogs as cogsIcon, faSignOutAlt } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { NavBar } from '@shlinkio/shlink-frontend-kit';
import type { FC } from 'react';
import { Link, useLocation } from 'react-router';
import { logout } from '../auth/session';
import { ServersDropdown } from '../servers/ServersDropdown';
import { ShlinkLogo } from './img/ShlinkLogo';

export const MainHeader: FC = () => {
  const { pathname } = useLocation();

  const settingsPath = '/settings';

  return (
    <NavBar
      className="[&]:fixed top-0 z-900"
      brand={
        <Link to="/" className="[&]:text-white no-underline flex items-center gap-2">
          <ShlinkLogo className="w-7" color="white" /> <small className="font-normal">Shlink</small>
        </Link>
      }
    >
      <NavBar.MenuItem
        to={settingsPath}
        active={pathname.startsWith(settingsPath)}
        className="flex items-center gap-1.5"
      >
        <FontAwesomeIcon icon={cogsIcon} /> Settings
      </NavBar.MenuItem>
      <ServersDropdown />
      <NavBar.MenuItem
        to="/auth/logout"
        onClick={(event) => {
          event.preventDefault();
          void logout();
        }}
        className="flex items-center gap-1.5"
      >
        <FontAwesomeIcon icon={faSignOutAlt} /> Sign out
      </NavBar.MenuItem>
    </NavBar>
  );
};
