import React from 'react';
import ReactDOM from 'react-dom/client';
import { Widget } from 'appspace-widget-api';
import ActionRequired from './ActionRequired';
import './index.css';

if (!window.appspace) {
  window.appspace = {};
}
window.appspace.widgetApi = new Widget();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ActionRequired />
  </React.StrictMode>
);
