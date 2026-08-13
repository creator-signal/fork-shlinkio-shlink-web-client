import { Card } from '@shlinkio/shlink-frontend-kit';
import { clsx } from 'clsx';
import type { FC } from 'react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { withoutSelectedServer } from '../servers/helpers/withoutSelectedServer';
import { useServers } from '../servers/reducers/servers';
import { ServersListGroup } from '../servers/ServersListGroup';
import { ShlinkLogo } from './img/ShlinkLogo';

export const Home: FC = withoutSelectedServer(() => {
  const navigate = useNavigate();
  const { servers } = useServers();
  const serversList = Object.values(servers);
  const hasServers = serversList.length > 0;

  useEffect(() => {
    // The deployment supplies exactly one server and marks it for automatic connection.
    const autoConnectServer = serversList.find(({ autoConnect }) => autoConnect);
    if (autoConnectServer) {
      navigate(`/server/${autoConnectServer.id}`);
    }
  }, [serversList, navigate]);

  return (
    <div className="px-3 w-full">
      <Card className="mx-auto max-w-[720px] overflow-hidden">
        <div className="flex flex-col md:flex-row">
          <div className="p-6 hidden md:flex items-center w-[40%]">
            <div className="w-full">
              <ShlinkLogo />
            </div>
          </div>

          <div className="md:border-l border-lm-border dark:border-dm-border flex-grow">
            <h1 className={clsx('p-4 text-center border-lm-border dark:border-dm-border', { 'border-b': !hasServers })}>
              Welcome!
            </h1>
            {hasServers ? (
              <ServersListGroup servers={serversList} />
            ) : (
              <div className="p-6 text-center flex flex-col gap-12 text-xl">
                <p>Loading the Creator Signal Shlink service...</p>
                <p className="text-sm">If this remains visible, check the service readiness endpoint and OIDC session.</p>
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
});
