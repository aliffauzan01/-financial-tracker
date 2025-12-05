import 'dotenv/config'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { setCookie, getCookie, deleteCookie } from 'hono/cookie'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import { db } from './db/index.js'
import { users, todos } from './db/schema.js'
import { eq } from 'drizzle-orm'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = new Hono()
const SECRET = process.env.JWT_SECRET || 'rahasia'

// ======================================================
// LOAD HTML
// ======================================================
const loadHTML = async (folder, file) => {
  const filePath = path.join(__dirname, 'public', folder, file)
  return await fs.promises.readFile(filePath, 'utf-8')
}

app.get('/', (c) => c.redirect('/login'))

app.get('/login', async (c) => c.html(await loadHTML('login', 'index.html')))
app.get('/register', async (c) => c.html(await loadHTML('register', 'index.html')))
app.get('/dashboard', async (c) => c.html(await loadHTML('dashboard', 'index.html')))
app.get('/todos', async (c) => c.html(await loadHTML('todos', 'index.html')))

// ======================================================
// AUTH MIDDLEWARE
// ======================================================
function auth(c) {
  const token = getCookie(c, 'token')
  if (!token) return null

  try {
    return jwt.verify(token, SECRET)
  } catch {
    return null
  }
}

// ======================================================
// REGISTER USER
// ======================================================
app.post('/api/register', async (c) => {
  const { username, password } = await c.req.json()

  const existing = await db.select().from(users).where(eq(users.username, username))
  if (existing.length > 0) {
    return c.json({ success: false, message: 'Username sudah dipakai' })
  }

  const hashed = await bcrypt.hash(password, 10)

  await db.insert(users).values({
    username,
    password: hashed
  })

  return c.json({ success: true, message: 'Registrasi berhasil' })
})

// ======================================================
// LOGIN USER
// ======================================================
app.post('/api/login', async (c) => {
  const { username, password } = await c.req.json()

  const found = await db.select().from(users).where(eq(users.username, username))
  if (found.length === 0)
    return c.json({ success: false, message: 'Username atau password salah' })

  const user = found[0]

  const valid = await bcrypt.compare(password, user.password)
  if (!valid) return c.json({ success: false, message: 'Username atau password salah' })

  const token = jwt.sign(
    { id: user.id, username: user.username },
    SECRET,
    { expiresIn: '1d' }
  )

  setCookie(c, 'token', token, { httpOnly: true, path: '/' })

  return c.json({ success: true, message: 'Login berhasil' })
})

// ======================================================
// LOGOUT
// ======================================================
app.post('/api/logout', (c) => {
  deleteCookie(c, 'token')
  return c.json({ success: true, message: 'Logout berhasil' })
})

// ======================================================
// GET USER LOGIN INFO
// ======================================================
app.get('/api/me', (c) => {
  const user = auth(c)
  if (!user) return c.json({ success: false, message: 'Belum login' })

  return c.json({ success: true, user })
})

// ======================================================
// TODOS — GET
// ======================================================
app.get('/api/todos', async (c) => {
  const user = auth(c)
  if (!user) return c.json({ success: false, message: 'Belum login' }, 401)

  const rows = await db.select().from(todos).where(eq(todos.userId, user.id))

  return c.json({ success: true, todos: rows })
})

// ======================================================
// TODOS — ADD
// ======================================================
app.post('/api/todos', async (c) => {
  const user = auth(c)
  if (!user) return c.json({ success: false, message: 'Belum login' }, 401)

  const { text } = await c.req.json()
  if (!text) return c.json({ success: false, message: 'Isi todo tidak boleh kosong' })

  const newTodo = await db.insert(todos)
    .values({
      text,
      completed: false,
      userId: user.id
    })
    .returning()

  return c.json({ success: true, todo: newTodo[0] })
})

// ======================================================
app.notFound((c) => c.text('404 Not Found'))

serve({ fetch: app.fetch, port: 3001 }, () => {
  console.log('Server jalan di http://localhost:3001')
})
