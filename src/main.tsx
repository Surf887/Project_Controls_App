import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import App from './App'
import { ProjectStoreProvider } from './store/projectStore'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ProjectStoreProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/close" replace />} />
          <Route path="/*" element={<App />} />
        </Routes>
      </ProjectStoreProvider>
    </BrowserRouter>
  </StrictMode>,
)
