const { app, BrowserWindow } = require('electron/main')
const path = require('node:path')

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

const createWindow = () => {
  const win = new BrowserWindow({ width: 800, height: 600 })
  if (DEV_SERVER_URL) win.loadURL(DEV_SERVER_URL)
  else win.loadFile(path.join(__dirname, '../dist/index.html'))
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})