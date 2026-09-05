import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import './theme.css'

const container = document.getElementById('root')
if (!container) throw new Error('renderer has no #root to mount into')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
