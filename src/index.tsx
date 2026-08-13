import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router';
import pack from '../package.json';
import { App } from './app/App';
import { ErrorHandler } from './common/ErrorHandler';
import { ScrollToTop } from './common/ScrollToTop';
import { container } from './container';
import { ContainerProvider } from './container/context';
import { setUpStore } from './store';
import './tailwind.css';

const store = setUpStore();

createRoot(document.getElementById('root')!).render(
  <ContainerProvider value={container}>
    <Provider store={store}>
      <BrowserRouter basename={pack.homepage}>
        <ErrorHandler>
          <ScrollToTop>
            <App />
          </ScrollToTop>
        </ErrorHandler>
      </BrowserRouter>
    </Provider>
  </ContainerProvider>,
);

// Remove caches and registrations left behind by upstream PWA builds. Authenticated
// application data must never be served from a browser-managed offline cache.
void navigator.serviceWorker
  ?.getRegistrations()
  .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())));
void window.caches?.keys().then((keys) => Promise.all(keys.map((key) => window.caches.delete(key))));
