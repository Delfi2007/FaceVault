import { useState, useEffect } from 'react'
import { getUsers, getAuditLogs, deleteUser } from '../lib/db'
import type { EnrolledUser, AuditLog } from '../lib/db'

interface Props { onEnroll: () => void; onAuth: () => void }
type Tab = 'home' | 'users' | 'audit'

function Ic({ d, className = '' }: { d: string | string[]; className?: string }) {
  const ps = Array.isArray(d) ? d : [d]
  return (
    <svg className={className || 'w-5 h-5'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      {ps.map((p, i) => <path key={i} strokeLinecap="round" strokeLinejoin="round" d={p} />)}
    </svg>
  )
}

const ic = {
  shield:  'm9 12.75 2.25 2.25L15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z',
  scan:    'M7 3H5a2 2 0 00-2 2v2m0 10v2a2 2 0 002 2h2m10-16h2a2 2 0 012 2v2m0 10v2a2 2 0 01-2 2h-2M9 12a3 3 0 106 0 3 3 0 00-6 0z',
  userAdd: ['M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z'],
  users:   ['M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z'],
  doc:     ['M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z'],
  chev:    'M8.25 4.5l7.5 7.5-7.5 7.5',
  trash:   'M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0',
}

export default function Dashboard({ onEnroll, onAuth }: Props) {
  const [tab, setTab]       = useState<Tab>('home')
  const [users, setUsers]   = useState<EnrolledUser[]>([])
  const [logs, setLogs]     = useState<AuditLog[]>([])
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    load()
    const on = () => setOnline(true); const off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  useEffect(() => { load() }, [tab])

  async function load() {
    const [u, l] = await Promise.all([getUsers(), getAuditLogs()])
    setUsers(u); setLogs(l)
  }

  const successes = logs.filter(l => l.action === 'AUTH_SUCCESS').length
  const unsynced  = logs.filter(l => !l.synced).length

  function badgeFor(a: AuditLog['action']) {
    return ({
      AUTH_SUCCESS:  { color: '#34c759', label: 'Verified'  },
      AUTH_FAIL:     { color: '#ff3b30', label: 'Failed'    },
      LIVENESS_FAIL: { color: '#ff9500', label: 'Liveness'  },
      ENROLL:        { color: '#007aff', label: 'Enrolled'  },
    })[a]
  }

  const tabItems: { key: Tab; label: string; d: string | string[] }[] = [
    { key: 'home',  label: 'Home',  d: ic.shield },
    { key: 'users', label: 'Users', d: ic.users  },
    { key: 'audit', label: 'Log',   d: ic.doc    },
  ]

  return (
    <div className="flex flex-col min-h-screen">

      {/* ━━ Header ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="bg-white px-5 pt-8 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[12px] bg-[#1c1c1e] flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d={ic.shield} />
              </svg>
            </div>
            <div>
              <p className="text-[17px] font-semibold text-[#1c1c1e] leading-tight tracking-tight">FaceVault</p>
              <p className="text-[11px] text-[#aeaeb2]">Offline Biometrics</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#f2f2f7] shrink-0">
            <span className={`w-[6px] h-[6px] rounded-full ${online ? 'bg-[#34c759]' : 'bg-[#aeaeb2]'}`} />
            <span className="text-[11px] font-medium text-[#8e8e93] whitespace-nowrap">{online ? 'Online' : 'Offline'}</span>
          </div>
        </div>
      </div>

      {/* ━━ Tabs ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="bg-white flex border-b border-[#e5e5ea]/70 px-2">
        {tabItems.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 flex flex-col items-center gap-[3px] py-2.5 transition-colors ${
              tab === t.key ? 'text-[#1c1c1e]' : 'text-[#aeaeb2]'}`}>
            <Ic d={t.d} className="w-[18px] h-[18px]" />
            <span className="text-[10px] font-semibold">{t.label}</span>
            {tab === t.key && <div className="w-5 h-[2px] rounded-full bg-[#1c1c1e] -mb-2.5" />}
          </button>
        ))}
      </div>

      {/* ━━ Content ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="flex-1 overflow-y-auto">

        {/* ── HOME ── */}
        {tab === 'home' && (
          <div className="p-4 space-y-3 fade-up">

            {/* Stats row */}
            <div className="card flex divide-x divide-[#f2f2f7]">
              {[
                { label: 'Enrolled',    value: users.length },
                { label: 'Verified',    value: successes    },
                { label: 'Events',      value: logs.length  },
                { label: 'Unsynced',    value: unsynced     },
              ].map(s => (
                <div key={s.label} className="flex-1 py-4 text-center">
                  <p className="text-[22px] font-bold text-[#1c1c1e] tabular-nums leading-none">{s.value}</p>
                  <p className="text-[10px] text-[#aeaeb2] font-medium mt-1.5 uppercase tracking-wide">{s.label}</p>
                </div>
              ))}
            </div>

            {/* CTA: Verify */}
            <button onClick={onAuth}
              className="card w-full flex items-center gap-4 px-4 py-4 active:scale-[0.98] transition-transform">
              <div className="w-11 h-11 rounded-2xl bg-[#1c1c1e] flex items-center justify-center shrink-0">
                <Ic d={ic.scan} className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-[15px] font-semibold text-[#1c1c1e]">Verify Identity</p>
                <p className="text-[12px] text-[#aeaeb2] mt-0.5">Offline face authentication</p>
              </div>
              <Ic d={ic.chev} className="w-4 h-4 text-[#c7c7cc]" />
            </button>

            {/* CTA: Enroll */}
            <button onClick={onEnroll}
              className="card w-full flex items-center gap-4 px-4 py-4 active:scale-[0.98] transition-transform">
              <div className="w-11 h-11 rounded-2xl bg-[#f2f2f7] flex items-center justify-center shrink-0">
                <Ic d={ic.userAdd} className="w-5 h-5 text-[#636366]" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-[15px] font-semibold text-[#1c1c1e]">Enroll New User</p>
                <p className="text-[12px] text-[#aeaeb2] mt-0.5">Register biometric template</p>
              </div>
              <Ic d={ic.chev} className="w-4 h-4 text-[#c7c7cc]" />
            </button>

            {/* Recent activity */}
            {logs.length > 0 && (
              <div className="pt-1">
                <p className="text-[11px] font-semibold text-[#aeaeb2] uppercase tracking-wider px-1 mb-2">Recent Activity</p>
                <div className="card overflow-hidden divide-y divide-[#f2f2f7]">
                  {logs.slice(0, 4).map(log => {
                    const b = badgeFor(log.action)
                    return (
                      <div key={log.id} className="flex items-center gap-3 px-4 py-3">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: b.color }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-[#1c1c1e] truncate">{log.userName}</p>
                          <p className="text-[11px] text-[#aeaeb2]">{new Date(log.timestamp).toLocaleString()}</p>
                        </div>
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md shrink-0"
                          style={{ color: b.color, background: b.color + '14' }}>
                          {b.label}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Pipeline — compact */}
            <div className="pt-1">
              <p className="text-[11px] font-semibold text-[#aeaeb2] uppercase tracking-wider px-1 mb-2">Pipeline</p>
              <div className="card px-4 py-3">
                <div className="flex items-center gap-1 flex-wrap">
                  {['Camera','Detect','Liveness','Embed','Match','Log'].map((s, i, a) => (
                    <span key={s} className="flex items-center gap-1">
                      <span className="text-[11px] font-medium text-[#636366] bg-[#f2f2f7] px-2 py-[3px] rounded-md">{s}</span>
                      {i < a.length - 1 && <span className="text-[#d1d1d6] text-[10px]">›</span>}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── USERS ── */}
        {tab === 'users' && (
          <div className="p-4 space-y-3 fade-up">
            {users.length === 0 ? (
              <div className="card flex flex-col items-center py-16 gap-4">
                <div className="w-14 h-14 rounded-2xl bg-[#f2f2f7] flex items-center justify-center">
                  <Ic d={ic.users} className="w-6 h-6 text-[#aeaeb2]" />
                </div>
                <div className="text-center">
                  <p className="text-[15px] font-semibold text-[#1c1c1e]">No users enrolled</p>
                  <p className="text-[13px] text-[#aeaeb2] mt-1">Add your first biometric template</p>
                </div>
                <button onClick={onEnroll}
                  className="h-[42px] px-5 bg-[#1c1c1e] text-white text-[14px] font-semibold rounded-xl active:opacity-80 transition-opacity">
                  Enroll User
                </button>
              </div>
            ) : (
              <div className="card overflow-hidden divide-y divide-[#f2f2f7]">
                {users.map(u => (
                  <div key={u.id} className="flex items-center gap-3 px-4 py-3.5">
                    <div className="w-10 h-10 rounded-full bg-[#1c1c1e] flex items-center justify-center shrink-0">
                      <span className="text-white font-semibold text-[13px]">{u.avatarInitials}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold text-[#1c1c1e] truncate">{u.name}</p>
                      <p className="text-[11px] text-[#aeaeb2] mt-0.5">{u.role} · {new Date(u.enrolledAt).toLocaleDateString()}</p>
                    </div>
                    <button onClick={() => deleteUser(u.id).then(load)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-[#c7c7cc] hover:text-[#ff3b30] hover:bg-[#fff1f0] transition-colors">
                      <Ic d={ic.trash} className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── AUDIT ── */}
        {tab === 'audit' && (
          <div className="p-4 space-y-3 fade-up">
            {logs.length === 0 ? (
              <div className="card flex flex-col items-center py-16 gap-4">
                <div className="w-14 h-14 rounded-2xl bg-[#f2f2f7] flex items-center justify-center">
                  <Ic d={ic.doc} className="w-6 h-6 text-[#aeaeb2]" />
                </div>
                <div className="text-center">
                  <p className="text-[15px] font-semibold text-[#1c1c1e]">No events yet</p>
                  <p className="text-[13px] text-[#aeaeb2] mt-1">Events appear after authentication</p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between px-1">
                  <p className="text-[11px] font-semibold text-[#aeaeb2] uppercase tracking-wider">{logs.length} Events</p>
                  {unsynced > 0 && (
                    <span className="text-[11px] font-medium text-[#aeaeb2] bg-[#f2f2f7] px-2 py-0.5 rounded-md">
                      {unsynced} pending sync
                    </span>
                  )}
                </div>
                <div className="card overflow-hidden divide-y divide-[#f2f2f7]">
                  {logs.map(log => {
                    const b = badgeFor(log.action)
                    return (
                      <div key={log.id} className="flex items-start gap-3 px-4 py-3.5">
                        <span className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ background: b.color }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-[13px] font-semibold text-[#1c1c1e]">{log.userName}</p>
                            <span className="text-[10px] font-semibold px-1.5 py-[1px] rounded"
                              style={{ color: b.color, background: b.color + '14' }}>{b.label}</span>
                          </div>
                          {log.similarity != null && (
                            <p className="text-[11px] text-[#8e8e93] font-mono mt-0.5">
                              confidence: {(log.similarity * 100).toFixed(1)}%
                            </p>
                          )}
                          <p className="text-[10px] text-[#c7c7cc] font-mono mt-0.5">{log.embeddingHash.slice(0, 24)}…</p>
                          <p className="text-[11px] text-[#aeaeb2] mt-0.5">{new Date(log.timestamp).toLocaleString()}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
