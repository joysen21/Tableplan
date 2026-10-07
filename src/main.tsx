import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { ErrorBoundary } from './ui/ErrorBoundary';
import '@fontsource-variable/inter';
import './styles/app.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ErrorBoundary area="app"><App /></ErrorBoundary>
    </BrowserRouter>
  </StrictMode>
);
