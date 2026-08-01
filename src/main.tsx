import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';
import App from './App';
import { initTheme } from './lib/theme';
import { initInstallCapture } from './lib/install';
import { initAuth } from './store/auth';

initTheme();
initInstallCapture();
initAuth();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
