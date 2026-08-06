import Store from 'electron-store'

/** Single shared electron-store instance for the main process */
const store = new Store()
export default store
