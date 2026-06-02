import { useState, useCallback } from 'react'
import ModelLoader from './components/ModelLoader'
import Dashboard from './components/Dashboard'
import EnrollFlow from './components/EnrollFlow'
import AuthFlow from './components/AuthFlow'
import type { EnrolledUser } from './lib/db'

type View = 'loading' | 'dashboard' | 'enroll' | 'auth'

export default function App() {
  const [view, setView] = useState<View>('loading')
  const onModelsLoaded = useCallback(() => setView('dashboard'), [])

  return (
    <div className="app-shell">
      {view === 'loading'    && <ModelLoader onLoaded={onModelsLoaded} />}
      {view === 'dashboard'  && <Dashboard onEnroll={() => setView('enroll')} onAuth={() => setView('auth')} />}
      {view === 'enroll'     && <EnrollFlow onBack={() => setView('dashboard')} onSuccess={(_u: EnrolledUser) => setView('dashboard')} />}
      {view === 'auth'       && <AuthFlow onBack={() => setView('dashboard')} />}
    </div>
  )
}
