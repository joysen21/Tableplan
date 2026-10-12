import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { APP_NAME } from './lib/edition';
import { ErrorBoundary } from './ui/ErrorBoundary';
import '@fontsource-variable/outfit';
import './styles/app.css';

// Gäste-Speisekarte per QR-Code (/m/<Tisch-Schlüssel>): öffentlich, ohne Anmeldung, eigener Code-Teil
const GuestMenuPage = lazy(() => import('./guest/GuestMenuPage').then(m => ({ default: m.GuestMenuPage })));
const guestToken = /^\/m\/([A-Za-z0-9]+)\/?$/.exec(location.pathname)?.[1];

document.title = APP_NAME;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {guestToken
      ? <Suspense fallback={null}><GuestMenuPage token={guestToken} /></Suspense>
      : <BrowserRouter><ErrorBoundary area="app"><App /></ErrorBoundary></BrowserRouter>}
  </StrictMode>
);
