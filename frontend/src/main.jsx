import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// Captura global temprana del evento de instalación (fuera de React)
window.addEventListener('beforeinstallprompt', (e) => {
  console.log('📢 PWA: Captura GLOBAL temprana del evento beforeinstallprompt');
  e.preventDefault();
  window.deferredPrompt = e;
});

// Registra el Service Worker de la PWA
registerSW({
  immediate: true,
  onRegisteredSW(swUrl, r) {
    console.log('✅ Service Worker de PWA registrado con éxito:', swUrl);
  }
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
