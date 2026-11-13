/**
 * Windows: place a BrowserWindow behind the desktop icons.
 *
 * Electron's `type: 'desktop'` only exists on macOS/Linux. On Windows the
 * established technique is to ask Progman to spawn a WorkerW window (message
 * 0x052C) and re-parent our window into it. Windows 11 24H2+ creates that
 * WorkerW as a child of Progman; older builds create it as a top-level sibling
 * of the window that hosts SHELLDLL_DefView. Both layouts are handled.
 *
 * Uses koffi (prebuilt FFI, no compiler needed). Every call is best-effort: if
 * anything fails the caller falls back to a non-focusable bottom-most window.
 */
import type { BrowserWindow } from 'electron'

type Koffi = typeof import('koffi')
interface User32 {
  FindWindowW: (cls: string | null, name: string | null) => unknown
  FindWindowExW: (parent: unknown, after: unknown, cls: string | null, name: string | null) => unknown
  SendMessageTimeoutW: (hwnd: unknown, msg: number, w: number, l: number, flags: number, timeout: number, result: unknown) => unknown
  EnumWindows: (cb: unknown, l: number) => boolean
  SetParent: (child: unknown, parent: unknown) => unknown
  SetWindowPos: (hwnd: unknown, after: unknown, x: number, y: number, w: number, h: number, flags: number) => boolean
  MapWindowPoints: (from: unknown, to: unknown, pts: unknown, count: number) => number
  koffi: Koffi
  EnumProc: unknown
}

let user32: User32 | null | undefined

function load(): User32 | null {
  if (user32 !== undefined) return user32
  if (process.platform !== 'win32') return (user32 = null)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const koffi: Koffi = require('koffi')
    const lib = koffi.load('user32.dll')
    const HWND = koffi.pointer('HWND', koffi.opaque())
    const EnumProc = koffi.proto('bool __stdcall EnumWindowsProc(HWND hwnd, intptr_t lParam)')
    user32 = {
      koffi,
      EnumProc,
      FindWindowW: lib.func('HWND __stdcall FindWindowW(str16 cls, str16 name)'),
      FindWindowExW: lib.func('HWND __stdcall FindWindowExW(HWND parent, HWND after, str16 cls, str16 name)'),
      SendMessageTimeoutW: lib.func('intptr_t __stdcall SendMessageTimeoutW(HWND hwnd, uint32_t msg, uintptr_t w, intptr_t l, uint32_t flags, uint32_t timeout, _Out_ uintptr_t *result)'),
      EnumWindows: lib.func('bool __stdcall EnumWindows(EnumWindowsProc *cb, intptr_t l)'),
      SetParent: lib.func('HWND __stdcall SetParent(HWND child, HWND parent)'),
      SetWindowPos: lib.func('bool __stdcall SetWindowPos(HWND hwnd, HWND after, int x, int y, int cx, int cy, uint32_t flags)'),
      MapWindowPoints: lib.func('int __stdcall MapWindowPoints(HWND from, HWND to, _Inout_ int *pts, uint32_t count)')
    }
    void HWND
    return user32
  } catch (err) {
    console.warn('[WindowsDesktop] koffi/user32 unavailable, using fallback wallpaper windows:', err)
    return (user32 = null)
  }
}

function findWorkerW(u: User32): unknown {
  const progman = u.FindWindowW('Progman', null)
  if (!progman) return null
  // Ask Progman to create the WorkerW layer behind the icons.
  u.SendMessageTimeoutW(progman, 0x052c, 0xd, 0x1, 0x0, 1000, [0])
  u.SendMessageTimeoutW(progman, 0x052c, 0, 0, 0x0, 1000, [0])

  // Windows 11 24H2+: WorkerW is a child of Progman.
  const child = u.FindWindowExW(progman, null, 'WorkerW', null)
  if (child) return child

  // Classic layout: the WorkerW sibling that follows the window hosting SHELLDLL_DefView.
  let worker: unknown = null
  const cb = u.koffi.register((hwnd: unknown) => {
    const defView = u.FindWindowExW(hwnd, null, 'SHELLDLL_DefView', null)
    if (defView) worker = u.FindWindowExW(null, hwnd, 'WorkerW', null)
    return true
  }, u.koffi.pointer(u.EnumProc as never))
  try {
    u.EnumWindows(cb, 0)
  } finally {
    u.koffi.unregister(cb)
  }
  return worker || progman
}

/** Re-parent `win` behind the desktop icons, sized to `bounds` (screen coordinates). Returns true on success. */
export function attachToDesktop(win: BrowserWindow, bounds: { x: number; y: number; width: number; height: number }, scaleFactor = 1): boolean {
  const u = load()
  if (!u) return false
  try {
    const worker = findWorkerW(u)
    if (!worker) return false
    const handle = win.getNativeWindowHandle()
    const hwnd = u.koffi.decode(handle, 'HWND')
    u.SetParent(hwnd, worker)
    // Child windows are positioned relative to the WorkerW client area (physical pixels).
    const pts = [Math.round(bounds.x * scaleFactor), Math.round(bounds.y * scaleFactor)]
    u.MapWindowPoints(null, worker, pts, 1)
    const SWP_NOZORDER = 0x0004, SWP_NOACTIVATE = 0x0010, SWP_SHOWWINDOW = 0x0040
    u.SetWindowPos(hwnd, null, pts[0], pts[1], Math.round(bounds.width * scaleFactor), Math.round(bounds.height * scaleFactor), SWP_NOZORDER | SWP_NOACTIVATE | SWP_SHOWWINDOW)
    return true
  } catch (err) {
    console.warn('[WindowsDesktop] attach failed:', err)
    return false
  }
}
