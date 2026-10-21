import { createApp, createSSRApp } from 'vue'
import App from './App.vue'
import './style.css'

const mode = window.location.pathname.split('/').filter(Boolean).at(-1) || 'csr'
const basePath = window.location.pathname.startsWith('/vue/') ? '/vue' : ''
const options = { initialFeed: window.__INITIAL_FEED__, mode, basePath }
const app = options.initialFeed ? createSSRApp(App, options) : createApp(App, options)
app.mount('#app')
