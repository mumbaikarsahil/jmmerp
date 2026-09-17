const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// Determine if we are running in Dev (local) or Prod (installed .exe)
const isDev = !app.isPackaged;

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false, // Security best practice
      contextIsolation: true, // Required for preload
      preload: path.join(__dirname, 'preload.cjs'), 
    },
    autoHideMenuBar: true,
  });

  // --- LOADING STRATEGY ---
  if (isDev) {
    // DEV MODE:
    // Currently points to your live Vercel site. 
    // Change this to 'http://localhost:8080' if you want to test local changes.
    mainWindow.loadURL('https://stock-buddy-drab.vercel.app/'); 
    mainWindow.webContents.openDevTools(); 
  } else {
    // PROD MODE:
    // This loads the local build file directly.
    // Fixes "Not allowed to load local resource" error.
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  // --- PRINTER HANDLERS ---
  ipcMain.handle('get-printers', async () => {
    return mainWindow.webContents.getPrintersAsync();
  });

  ipcMain.handle('print-component', async (event, htmlContent, printerName) => {
    // Create a hidden window for silent printing
    const printWindow = new BrowserWindow({ show: false, width: 800, height: 600 });
    
    // Load the content
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

    const options = {
      silent: true,
      deviceName: printerName,
    };

    try {
      await printWindow.webContents.print(options);
      // Close window after print command is sent
      printWindow.close();
      return { success: true };
    } catch (error) {
      printWindow.close();
      console.error("Print Failed:", error);
      throw error;
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});