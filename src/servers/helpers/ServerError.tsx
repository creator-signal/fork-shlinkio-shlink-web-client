import { Message } from '@shlinkio/shlink-frontend-kit';
import type { FC } from 'react';
import { NoMenuLayout } from '../../common/NoMenuLayout';
import { isServerWithId } from '../data';
import { useSelectedServer } from '../reducers/selectedServer';

export const ServerError: FC = () => {
  const { selectedServer } = useSelectedServer();

  return (
    <NoMenuLayout>
      <div className="flex flex-col items-center gap-y-4 md:gap-y-8">
        <Message className="w-full lg:w-[80%]" variant="error">
          {!isServerWithId(selectedServer) && 'Could not find this Shlink server.'}
          {isServerWithId(selectedServer) && (
            <>
              <p>Oops! Could not connect to this Shlink server.</p>
              Make sure you have internet connection, and the server is properly configured and on-line.
            </>
          )}
        </Message>

        <p className="text-xl">The server connection is managed by the Creator Signal deployment configuration.</p>
      </div>
    </NoMenuLayout>
  );
};
