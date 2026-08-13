import { combineReducers } from '@reduxjs/toolkit';
import { selectedServerReducer } from '../servers/reducers/selectedServer';
import { serversReducer } from '../servers/reducers/servers';
import { settingsReducer } from '../settings/reducers/settings';

export const initReducers = () =>
  combineReducers({
    servers: serversReducer,
    selectedServer: selectedServerReducer,
    settings: settingsReducer,
  });
