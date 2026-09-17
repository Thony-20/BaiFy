import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { registerAppUpdates } from './pwa/registerAppUpdates';

// Captura global temprana del evento de instalación (fuera de React)
window.addEventListener('beforeinstallprompt', (e) => {
  console.log('📢 PWA: Captura GLOBAL temprana del evento beforeinstallprompt');
  e.preventDefault();
  window.deferredPrompt = e;
});

registerAppUpdates();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
