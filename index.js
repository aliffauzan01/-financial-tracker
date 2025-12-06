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
import { users, transactions } from './db/schema.js'
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

// ======================================================
// AUTH HELPERS
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
// REGISTER
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
// LOGIN
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
// WHO AM I
// ======================================================
app.get('/api/me', (c) => {
  const user = auth(c)
  if (!user) return c.json({ success: false, message: 'Belum login' })
  return c.json({ success: true, user })
})

// ======================================================
// MIDDLEWARE: inject user
// ======================================================
app.use("*", async (c, next) => {
  const user = auth(c)
  if (user) c.set("user", user)
  await next()
})

// ======================================================
// GET TRANSACTIONS
// ======================================================
app.get("/api/transactions", async (c) => {
  const user = c.get("user")
  if (!user) return c.json({ success: false, message: "Belum login" })

  const rows = await db.select().from(transactions)
    .where(eq(transactions.userId, user.id))

  return c.json({ success: true, transactions: rows })
})

// ======================================================
// ADD TRANSACTION
// ======================================================
app.post("/api/transaction/add", async (c) => {
  try {
    const user = c.get("user")
    if (!user) return c.json({ success: false, message: "Belum login" })

    const body = await c.req.json()

    // === FIX NOMINAL ===
    let nominal = body.amount
    if (!nominal) {
      return c.json({ success: false, message: "Nominal wajib diisi" })
    }

    // Buang titik 100.000.000 → 100000000
    nominal = nominal.toString().replace(/\./g, "")

    // === FIX DATE ===
    let tanggal = body.date
    if (!tanggal) tanggal = new Date().toISOString()  // default hari ini

    await db.insert(transactions).values({
      userId: user.id,
      nominal: nominal,
      transactionDate: new Date(tanggal),
      status: body.status,
      description: body.description || ""
    })

    return c.json({ success: true, message: "Transaksi berhasil ditambahkan" })

  } catch (err) {
    console.log(err)
    return c.json({ success: false, message: "Gagal menambahkan transaksi" })
  }
})


// ======================================================
app.notFound((c) => c.text('404 Not Found'))

serve({ fetch: app.fetch, port: 3001 }, () => {
  console.log('Server jalan di http://localhost:3001')
})
