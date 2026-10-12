import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { APP_NAME } from './lib/edition';
import { ErrorBoundary } from './ui/ErrorBoundary';
import '@fontsource-variable/outfit';
import './styles/app.css';

document.title = APP_NAME;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ErrorBoundary area="app"><App /></ErrorBoundary>
    </BrowserRouter>
  </StrictMode>
);
