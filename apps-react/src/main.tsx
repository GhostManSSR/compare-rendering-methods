import { createRoot, hydrateRoot } from 'react-dom/client'
import { App } from './App'
import './index.css'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

const mode = window.location.pathname.split('/').filter(Boolean).at(-1) || 'csr'
const basePath = window.location.pathname.startsWith('/react/') ? '/react' : ''
if (window.__INITIAL_FEED__) {
  hydrateRoot(root, <App initialFeed={window.__INITIAL_FEED__} mode={mode} basePath={basePath} />)
} else {
  createRoot(root).render(<App mode={mode} basePath={basePath} />)
}
