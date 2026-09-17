const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 1. Ask Windows for a list of printers
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  
  // 2. Send data to be printed silently
  printComponent: (html, printerName) => ipcRenderer.invoke('print-component', html, printerName)
});