import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { I18nProvider } from '@/base/i18n/I18nContext';
import { setFileTransport } from '@/base/logger/logger';
import './styles/index.css';

// Renderer process logs are sent to Main process via IPC for file writing
if (window.electron?.log) {
  setFileTransport((line) => window.electron.log.write(line));
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <I18nProvider>
    <App />
  </I18nProvider>
);
