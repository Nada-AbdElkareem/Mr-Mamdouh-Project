const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const isDev = process.env.NODE_ENV === 'development';

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: "Mersal Doc AI",
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    const indexPath = path.join(__dirname, 'dist', 'index.html');
    mainWindow.loadFile(indexPath).catch(err => {
      console.error('Failed to load index.html:', err);
    });
  }

  // Debug white screen
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error(`Failed to load URL: ${validatedURL} with error: ${errorDescription} (${errorCode})`);
    if (isDev) {
      setTimeout(() => {
        console.log('Retrying to load...');
        mainWindow.loadURL('http://localhost:3000');
      }, 2000);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

const fs = require('fs');

ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.on('log-error', (event, data) => {
  const { error, timestamp, context, stage } = data;
  const logEntry = `
[${timestamp}] PHASE: ${stage || 'UNKNOWN'}
ERROR: ${error}
CONTEXT: ${JSON.stringify(context, null, 2)}
-------------------
`;
  
  fs.appendFileSync(path.join(app.getPath('userData'), "app_errors.log"), logEntry);
  console.error(`Logged client error [${stage}]: ${error}`);
});
