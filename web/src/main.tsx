import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import 'highlight.js/styles/github.css'
import App from './App.tsx'

// Best-effort: ask the browser not to evict our IndexedDB data under
// storage pressure (web brief pitfall #7). Safe to ignore if unsupported
// or denied -- there's no fallback to build here, just a request.
navigator.storage?.persist?.().catch(() => {})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
