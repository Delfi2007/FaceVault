import { useState, useEffect } from 'react'
import {
  Shield, Users, Clock, Activity, Trash2,
  CheckCircle, XCircle, AlertTriangle, ChevronRight, Wifi, WifiOff
} from 'lucide-react'
import { getUsers, getAuditLogs, deleteUser } from '../lib/db'
import type { EnrolledUser, AuditLog } from '../lib/db'

interface Props {
  onEnroll: () => void
  onAuth: () => void
}

type Tab = 'home' | 'users' | 'audit'

export default function Dashboard({ onEnroll, onAuth }: Props) {
  const [tab, setTab] = useState<Tab>('home')
  const [users, setUsers] = useState<EnrolledUser[]>([])
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    loadData()
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  useEffect(() => {
    if (tab === 'users') loadData()
    if (tab === 'audit') loadData()
  }, [tab])

  async function loadData() {
    const [u, l] = await Promise.all([getUsers(), getAuditLogs()])
    setUsers(u)
    setLogs(l)
  }

  async function handleDelete(id: string) {
    await deleteUser(id)
    await loadData()
  }

  const successCount = logs.filter(l => l.action === 'AUTH_SUCCESS').length
  const unsynced = logs.filter(l => !l.synced).length

  function actionColor(action: AuditLog['action']) {
    switch (action) {
      case 'AUTH_SUCCESS': return 'text-white'
      case 'AUTH_FAIL': return 'text-zinc-500'
      case 'LIVENESS_FAIL': return 'text-zinc-500'
      case 'ENROLL': return 'text-zinc-300'
    }
  }

  function actionIcon(action: AuditLog['action']) {
    switch (action) {
      case 'AUTH_SUCCESS': return <CheckCircle className="w-4 h-4 text-white" />
      case 'AUTH_FAIL': return <XCircle className="w-4 h-4 text-zinc-600" />
      case 'LIVENESS_FAIL': return <AlertTriangle className="w-4 h-4 text-zinc-600" />
      case 'ENROLL': return <Shield className="w-4 h-4 text-zinc-400" />
    }
  }

  function actionLabel(action: AuditLog['action']) {
    switch (action) {
      case 'AUTH_SUCCESS': return 'Auth Passed'
      case 'AUTH_FAIL': return 'Auth Failed'
      case 'LIVENESS_FAIL': return 'Liveness Fail'
      case 'ENROLL': return 'Enrolled'
    }
  }

  return (
    <div className="min-h-screen bg-black flex flex-col max-w-lg mx-auto">
      {/* Header */}
      <div className="px-4 pt-6 pb-4 border-b border-zinc-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center">
              <Shield className="w-5 h-5 text-black" strokeWidth={2} />
            </div>
            <div>
              <h1 className="text-white font-bold text-lg leading-none">FaceVault</h1>
              <p className="text-zinc-600 text-xs mt-0.5">Zero-Trust Biometrics</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs ${
              online ? 'border-zinc-800 text-zinc-500' : 'border-zinc-800 text-zinc-700'
            }`}>
              {online ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              {online ? 'Online' : 'Offline'}
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-zinc-900">
        {([['home', 'Home'], ['users', 'Users'], ['audit', 'Audit Log']] as const).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-3 text-xs font-medium transition-colors ${
              tab === t ? 'text-white border-b border-white' : 'text-zinc-600 hover:text-zinc-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* HOME TAB */}
        {tab === 'home' && (
          <div className="p-4 space-y-4 slide-up">
            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Enrolled', value: users.length, icon: Users },
                { label: 'Auth Events', value: logs.length, icon: Activity },
                { label: 'Successes', value: successCount, icon: CheckCircle },
                { label: 'Pending Sync', value: unsynced, icon: Clock },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="border border-zinc-900 rounded-xl p-4 card-hover">
                  <Icon className="w-4 h-4 text-zinc-600 mb-2" />
                  <p className="text-2xl font-bold text-white">{value}</p>
                  <p className="text-zinc-600 text-xs mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="space-y-2">
              <button
                onClick={onAuth}
                className="w-full flex items-center justify-between bg-white text-black px-5 py-4 rounded-xl hover:bg-zinc-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Shield className="w-5 h-5" />
                  <div className="text-left">
                    <p className="font-semibold text-sm">Verify Identity</p>
                    <p className="text-xs text-zinc-600">Offline face authentication</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                onClick={onEnroll}
                className="w-full flex items-center justify-between border border-zinc-800 text-white px-5 py-4 rounded-xl hover:bg-zinc-900 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Users className="w-5 h-5 text-zinc-400" />
                  <div className="text-left">
                    <p className="font-semibold text-sm">Enroll New User</p>
                    <p className="text-xs text-zinc-600">Register biometric template</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-600" />
              </button>
            </div>

            {/* Recent activity */}
            {logs.length > 0 && (
              <div className="space-y-2">
                <p className="text-zinc-600 text-xs font-medium px-1">Recent Activity</p>
                <div className="border border-zinc-900 rounded-xl overflow-hidden divide-y divide-zinc-900">
                  {logs.slice(0, 5).map(log => (
                    <div key={log.id} className="flex items-center gap-3 px-4 py-3">
                      {actionIcon(log.action)}
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-medium truncate ${actionColor(log.action)}`}>
                          {log.userName} — {actionLabel(log.action)}
                        </p>
                        <p className="text-zinc-700 text-xs">{new Date(log.timestamp).toLocaleString()}</p>
                      </div>
                      {!log.synced && <div className="w-1.5 h-1.5 rounded-full bg-zinc-700 shrink-0" />}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Architecture note */}
            <div className="border border-zinc-900 rounded-xl p-4 space-y-2">
              <p className="text-white text-xs font-semibold">Pipeline</p>
              <div className="flex flex-wrap gap-1.5">
                {['Camera', '→', 'MediaPipe', '→', 'Liveness Gate', '→', 'Embedder', '→', 'Cosine Match', '→', 'AES Log'].map((s, i) => (
                  <span key={i} className={`text-xs ${s === '→' ? 'text-zinc-700' : 'text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded'}`}>{s}</span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* USERS TAB */}
        {tab === 'users' && (
          <div className="p-4 space-y-3 slide-up">
            {users.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 space-y-3">
                <Users className="w-10 h-10 text-zinc-800" />
                <p className="text-zinc-600 text-sm">No enrolled users</p>
                <button
                  onClick={onEnroll}
                  className="px-4 py-2 bg-white text-black text-sm font-medium rounded-lg hover:bg-zinc-100 transition-colors"
                >
                  Enroll First User
                </button>
              </div>
            ) : (
              users.map(user => (
                <div key={user.id} className="border border-zinc-900 rounded-xl overflow-hidden card-hover">
                  <div className="flex items-center gap-3 p-4">
                    <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shrink-0">
                      <span className="text-black font-bold text-sm">{user.avatarInitials}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium text-sm truncate">{user.name}</p>
                      <p className="text-zinc-600 text-xs">{user.role}</p>
                    </div>
                    <button
                      onClick={() => handleDelete(user.id)}
                      className="p-2 rounded-lg hover:bg-zinc-900 transition-colors text-zinc-700 hover:text-zinc-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="border-t border-zinc-900 px-4 py-2 flex justify-between">
                    <span className="text-zinc-700 text-xs">Enrolled {new Date(user.enrolledAt).toLocaleDateString()}</span>
                    <span className="text-zinc-700 text-xs font-mono">128-dim • AES-256</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* AUDIT TAB */}
        {tab === 'audit' && (
          <div className="p-4 space-y-2 slide-up">
            {logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 space-y-3">
                <Clock className="w-10 h-10 text-zinc-800" />
                <p className="text-zinc-600 text-sm">No audit events yet</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between px-1 pb-1">
                  <p className="text-zinc-600 text-xs">{logs.length} events • {unsynced} pending sync</p>
                  <div className="flex items-center gap-1.5 text-xs text-zinc-700">
                    <WifiOff className="w-3 h-3" />
                    Queued for sync
                  </div>
                </div>
                <div className="border border-zinc-900 rounded-xl overflow-hidden divide-y divide-zinc-900">
                  {logs.map(log => (
                    <div key={log.id} className="flex items-start gap-3 px-4 py-3">
                      <div className="mt-0.5">{actionIcon(log.action)}</div>
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <p className={`text-xs font-medium ${actionColor(log.action)}`}>{actionLabel(log.action)}</p>
                          {!log.synced && <span className="text-xs text-zinc-700 bg-zinc-900 px-1.5 py-0.5 rounded">unsynced</span>}
                        </div>
                        <p className="text-zinc-500 text-xs truncate">{log.userName}</p>
                        {log.similarity != null && (
                          <p className="text-zinc-700 text-xs font-mono">sim: {(log.similarity * 100).toFixed(1)}%</p>
                        )}
                        <p className="text-zinc-700 text-xs font-mono">{log.embeddingHash.substring(0, 16)}…</p>
                        <p className="text-zinc-700 text-xs">{new Date(log.timestamp).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Bottom safe area */}
      <div className="h-safe-area-inset-bottom" />
    </div>
  )
}
