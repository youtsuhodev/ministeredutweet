import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import './hooks/useInstallPrompt';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

/* Politique « aucun cache » : on purge ce qu'une ancienne version aurait stocké (Cache Storage). */
if ('caches' in window) {
  caches
    .keys()
    .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
    .catch(() => {});
}

/* PWA : le service worker (sans cache, il ne sert qu'à l'installation et à la page hors-ligne) n'est enregistré
   qu'en production. `updateViaCache: 'none'` : le navigateur ne réutilise jamais une copie de sw.js. */
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {});
  });
}
