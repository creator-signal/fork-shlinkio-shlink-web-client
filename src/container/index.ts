import { useTimeoutToggle } from '@shlinkio/shlink-frontend-kit';
import Bottle from 'bottlejs';
import { BffHttpClient } from '../api/services/HttpClient';
import { buildShlinkApiClient } from '../api/services/ShlinkApiClientBuilder';
import { LocalStorage } from '../utils/services/LocalStorage';
import { TagColorsStorage } from '../utils/services/TagColorsStorage';

const bottle = new Bottle();

export const { container } = bottle;

bottle.constant('window', window);
bottle.constant('console', console);
bottle.constant('fetch', window.fetch.bind(window));
bottle.service('HttpClient', BffHttpClient, 'fetch');

bottle.constant('localStorage', window.localStorage);
bottle.service('Storage', LocalStorage, 'localStorage');
bottle.service('TagColorsStorage', TagColorsStorage, 'Storage');

bottle.serviceFactory('useTimeoutToggle', () => useTimeoutToggle);

bottle.serviceFactory('buildShlinkApiClient', buildShlinkApiClient, 'HttpClient');
