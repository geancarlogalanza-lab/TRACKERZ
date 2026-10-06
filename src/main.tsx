import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Boot } from './boot/Boot'
import { registerServiceWorker } from './lib/registerServiceWorker'
// Self-hosted, so it is cached with the app and every device renders the same face.
import '@fontsource-variable/geist'
import './styles.css'

// Tells the safety net in index.html that the app's code arrived and runs.
;(window as Window & { __geanBooted?: boolean }).__geanBooted = true

const root = createRoot(document.getElementById('root')!)

// Development only: ?gean=0.4 holds the loading screen at a fill level,
// ?gean=error shows the error state, ?gean=demo plays a simulated start-up.
// ?reading=preview shows the Reading screens with sample data.
const params = import.meta.env.DEV ? new URLSearchParams(location.search) : null
const preview = params?.get('gean')

if (preview) {
  void import('./boot/GeanPreview').then(({ GeanPreview }) =>
    root.render(
      <StrictMode>
        <GeanPreview mode={preview} />
      </StrictMode>,
    ),
  )
} else if (params?.get('reading') === 'preview') {
  document.getElementById('gean-shell')?.remove()
  void import('./components/reading/ReadingPreview').then(({ ReadingPreview }) =>
    root.render(
      <StrictMode>
        <ReadingPreview />
      </StrictMode>,
    ),
  )
} else {
  root.render(
    <StrictMode>
      <Boot />
    </StrictMode>,
  )
}

registerServiceWorker()
