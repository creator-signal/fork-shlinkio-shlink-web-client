import { changeThemeInMarkup, getSystemPreferredTheme } from '@shlinkio/shlink-frontend-kit';
import { clsx } from 'clsx';
import type { FC } from 'react';
import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router';
import { Home } from '../common/Home';
import { MainHeader } from '../common/MainHeader';
import { NotFound } from '../common/NotFound';
import { ShlinkVersionsContainer } from '../common/ShlinkVersionsContainer';
import { ShlinkWebComponentContainer } from '../common/ShlinkWebComponentContainer';
import { useLoadRemoteServers } from '../servers/reducers/remoteServers';
import { useSettings } from '../settings/reducers/settings';
import { Settings } from '../settings/Settings';

export const App: FC = () => {
  useLoadRemoteServers();

  const location = useLocation();
  const isHome = location.pathname === '/';

  const { settings } = useSettings();
  useEffect(() => {
    changeThemeInMarkup(settings.ui?.theme ?? getSystemPreferredTheme());
  }, [settings.ui?.theme]);

  return (
    <div className="h-full">
      <>
        <MainHeader />

        <div className="h-full pt-(--header-height)">
          <div
            data-testid="shlink-wrapper"
            className={clsx(
              'min-h-full pb-[calc(var(--footer-height)+var(--footer-margin))] -mb-[calc(var(--footer-height)+var(--footer-margin))]',
              { 'flex items-center pt-4': isHome },
            )}
          >
            <Routes>
              <Route index element={<Home />} />
              <Route path="/settings">
                {['', '*'].map((path) => (
                  <Route key={path} path={path} element={<Settings />} />
                ))}
              </Route>
              <Route path="/server/:serverId">
                {['', '*'].map((path) => (
                  <Route key={path} path={path} element={<ShlinkWebComponentContainer />} />
                ))}
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </div>

          <div className="h-(--footer-height) mt-(--footer-margin) md:px-4">
            <ShlinkVersionsContainer />
          </div>
        </div>
      </>
    </div>
  );
};
