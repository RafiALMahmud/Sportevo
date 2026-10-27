import '@fontsource-variable/space-grotesk'
import '@fontsource-variable/manrope'
import '@fontsource/noto-sans-bengali/bengali-400.css'
import '@fontsource/noto-sans-bengali/bengali-600.css'
import '@fontsource/noto-sans-bengali/bengali-700.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import './index.css'
import App from './App.jsx'
import favicon from './assets/brand/favicon-transparent.png'
import { AuthProvider } from './context/AuthContext'
let initialTheme = 'dark'
try { initialTheme = localStorage.getItem('theme') === 'light' ? 'light' : 'dark' } catch { /* Storage may be unavailable. */ }
document.documentElement.dataset.theme = initialTheme
const icon = document.querySelector('link[rel="icon"]')
if (icon) { icon.href = favicon; icon.type = 'image/png' }
document.querySelector('meta[name="theme-color"]')?.setAttribute('content', initialTheme === 'light' ? '#f8fafc' : '#060607')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HelmetProvider>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </HelmetProvider>
  </StrictMode>
)
