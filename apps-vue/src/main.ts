import { createApp, createSSRApp } from 'vue'
import App from './App.vue'
import './style.css'

const mode = window.location.pathname.split('/').filter(Boolean).at(-1) || 'csr'
const basePath = window.location.pathname.startsWith('/vue/') ? '/vue' : ''
const workload = new URLSearchParams(window.location.search).get('workload')
if (workload && workload !== 'light') {
  const script = document.createElement('script')
  script.src = `/benchmark-assets/workload.js?workload=${encodeURIComponent(workload)}`
  document.head.append(script)
}

const options = { initialFeed: window.__INITIAL_FEED__, mode, basePath }
const app = options.initialFeed ? createSSRApp(App, options) : createApp(App, options)
app.mount('#app')
