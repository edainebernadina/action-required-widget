import React from 'react';
import ReactDOM from 'react-dom/client';
import ActionRequired from './ActionRequired';
import './index.css';

window.appspace.waitForWidgetApi()
  .then(() => {
    ReactDOM.createRoot(document.getElementById('root')).render(
      <React.StrictMode>
        <ActionRequired />
      </React.StrictMode>
    );
  })
  .catch((error) => {
    console.error('[ActionRequired] Failed to initialize:', error);
  });
