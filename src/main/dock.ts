import { app, BrowserWindow, Menu, shell } from 'electron'
import store from './store'

type Listener = () => void
const listeners = new Set<Listener>()

/** Subscribe to Dock visibility changes (tray + app menu rebuild their checkboxes). */
export function onDockVisibilityChange(fn: Listener): void {
  listeners.add(fn)
}

export function isDockVisible(): boolean {
  return store.get('showInDock', true) as boolean
}

/** Show or hide the macOS Dock icon, persist the choice and refresh menus. */
export function setDockVisible(visible: boolean, { persist = true } = {}): void {
  if (persist) store.set('showInDock', visible)
  if (process.platform === 'darwin' && app.dock) {
    if (visible) {
      void app.dock.show()
    } else {
      app.dock.hide()
      // Hiding the Dock icon demotes the app; keep the gallery reachable from the tray.
    }
  }
  listeners.forEach((fn) => fn())
}

/** macOS top menu bar for when Vantage is the active app. */
export function buildAppMenu(openGallery: () => void, openPreferences: () => void): void {
  const isMac = process.platform === 'darwin'
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { label: 'Preferences…', accelerator: 'Cmd+,', click: openPreferences },
              { type: 'separator' as const },
              {
                label: 'Show in Dock',
                type: 'checkbox' as const,
                checked: isDockVisible(),
                click: (item: Electron.MenuItem) => setDockVisible(item.checked)
              },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const }
            ]
          }
        ]
      : []),
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { label: 'Open Gallery', accelerator: 'CmdOrCtrl+1', click: openGallery },
        ...(!app.isPackaged ? [{ role: 'reload' as const }, { role: 'toggleDevTools' as const }] : []),
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [{ label: 'Vantage on GitHub', click: () => shell.openExternal('https://github.com/satiricalguru/Vantage') }]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/** Bring a window to the front even when the app is not active (e.g. launched from Terminal or the tray). */
export function revealWindow(win: BrowserWindow): void {
  if (win.isMinimized()) win.restore()
  win.show()
  if (process.platform === 'darwin') app.focus({ steal: true })
  win.focus()
}
