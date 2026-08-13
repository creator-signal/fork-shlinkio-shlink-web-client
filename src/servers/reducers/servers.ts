import { createSlice } from '@reduxjs/toolkit';
import { useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '../../store';
import type { ServersMap, ServerWithId } from '../data';
import { serversListToMap } from '../helpers';

const initialState: ServersMap = {};

export const { actions, reducer: serversReducer } = createSlice({
  name: 'shlink/servers',
  initialState,
  reducers: {
    createServers: {
      prepare: (servers: ServerWithId[]) => ({ payload: serversListToMap(servers) }),
      reducer: (_state, { payload: newServers }: { payload: ServersMap }) => newServers,
    },
  },
});

export const { createServers } = actions;

export const useServers = () => {
  const dispatch = useAppDispatch();
  const servers = useAppSelector((state) => state.servers);
  const createServers = useCallback((servers: ServerWithId[]) => dispatch(actions.createServers(servers)), [dispatch]);

  return { servers, createServers };
};
