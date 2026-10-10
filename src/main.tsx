import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from '@/app/App';
import { SettingsProvider } from '@/app/providers/SettingsProvider';
import { RepositoryProvider } from '@/app/providers/RepositoryProvider';
import { ContentProvider } from '@/features/content/ContentProvider';
import { PwaUpdateProvider } from '@/features/pwa/updates/PWAUpdateService';
import '@/styles/globals.css';

const container = document.getElementById('root');

if (container === null) {
  throw new Error('Root container #root is missing from index.html.');
}

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <SettingsProvider>
        <RepositoryProvider>
          <ContentProvider>
            <PwaUpdateProvider>
              <App />
            </PwaUpdateProvider>
          </ContentProvider>
        </RepositoryProvider>
      </SettingsProvider>
    </BrowserRouter>
  </StrictMode>,
);
