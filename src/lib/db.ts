import { openDB } from 'idb'
import type { DBSchema, IDBPDatabase } from 'idb'

export interface EnrolledUser {
  id: string
  name: string
  role: string
  encryptedEmbedding: string
  deviceFingerprint: string
  enrolledAt: number
  avatarInitials: string
}

export interface AuditLog {
  id: string
  userId: string
  userName: string
  action: 'ENROLL' | 'AUTH_SUCCESS' | 'AUTH_FAIL' | 'LIVENESS_FAIL'
  timestamp: number
  embeddingHash: string
  similarity?: number
  synced: boolean
  location?: { lat: number; lng: number }
}

interface FaceVaultDB extends DBSchema {
  users: { key: string; value: EnrolledUser }
  audit: { key: string; value: AuditLog; indexes: { 'by-timestamp': number; 'by-user': string } }
}

let _db: IDBPDatabase<FaceVaultDB> | null = null

async function getDB(): Promise<IDBPDatabase<FaceVaultDB>> {
  if (_db) return _db
  _db = await openDB<FaceVaultDB>('facevault', 1, {
    upgrade(db) {
      db.createObjectStore('users', { keyPath: 'id' })
      const audit = db.createObjectStore('audit', { keyPath: 'id' })
      audit.createIndex('by-timestamp', 'timestamp')
      audit.createIndex('by-user', 'userId')
    },
  })
  return _db
}

export async function saveUser(user: EnrolledUser) {
  const db = await getDB()
  await db.put('users', user)
}

export async function getUsers(): Promise<EnrolledUser[]> {
  const db = await getDB()
  return db.getAll('users')
}

export async function deleteUser(id: string) {
  const db = await getDB()
  await db.delete('users', id)
}

export async function addAuditLog(log: AuditLog) {
  const db = await getDB()
  await db.put('audit', log)
}

export async function getAuditLogs(): Promise<AuditLog[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex('audit', 'by-timestamp')
  return all.reverse()
}

export async function getAuditLogsForUser(userId: string): Promise<AuditLog[]> {
  const db = await getDB()
  return db.getAllFromIndex('audit', 'by-user', userId)
}
