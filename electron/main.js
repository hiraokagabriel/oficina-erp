// electron/main.js
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), // ✅ IMPORTANTE!
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile('dist/index.html'); // Ou win.loadURL('http://localhost:5173')
}

app.whenReady().then(createWindow);
