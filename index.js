import 'dotenv/config'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { setCookie, getCookie } from 'hono/cookie'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = new Hono()
const SECRET = process.env.JWT_SECRET || 'rahasia'

// Database sementara di memory
const users = []
const todos = []

//ROUTE HALAMAN HTML
const loadHTML = async (folder, file) => {
  const filePath = path.join(__dirname, 'public', folder, file)
  return await fs.promises.readFile(filePath, 'utf-8')
}

app.get('/', c => c.html('<h1>Server Jalan</h1><a href="/login">Login</a>'))

app.get('/login', async c => c.html(await loadHTML('login', 'index.html')))
app.get('/register', async c => c.html(await loadHTML('register', 'index.html')))

// MIDDLEWARE AUTENTIKASI
function auth(c) {
  const token = getCookie(c, 'token')
  if (!token) return null
  try {
    return jwt.verify(token, SECRET)
  } catch {
    return null
  }
}

//API AUTH (REGISTER + LOGIN)
app.post('/api/register', async c => {
  const { username, password } = await c.req.json()
  if (users.find(u => u.username === username))
    return c.json({ success: false, message: 'Username sudah dipakai' })

  const newUser = {
    id: Date.now(),
    username,
    password: await bcrypt.hash(password, 10)
  }

  users.push(newUser)
  return c.json({ success: true, message: 'Register berhasil' })
})

app.post('/api/login', async c => {
  const { username, password } = await c.req.json()
  const user = users.find(u => u.username === username)

  if (!user || !(await bcrypt.compare(password, user.password)))
    return c.json({ success: false, message: 'Username atau password salah' })

  // Buat token
  const token = jwt.sign({ id: user.id, username }, SECRET, {
    expiresIn: '1d'
  })

  setCookie(c, 'token', token, { httpOnly: true, path: '/' })
  return c.json({ success: true, message: 'Login berhasil' })
})

//TODOS API
app.get('/api/todos', c => {
  const user = auth(c)
  if (!user) return c.json({ success: false, message: 'Belum login' }, 401)

  const userTodos = todos.filter(t => t.userId === user.id)
  return c.json({ success: true, todos: userTodos })
})

app.post('/api/todos', async c => {
  const user = auth(c)
  if (!user) return c.json({ success: false, message: 'Belum login' }, 401)

  const { text } = await c.req.json()
  if (!text) return c.json({ success: false, message: 'Isi todo' }, 400)

  const todo = {
    id: Date.now(),
    userId: user.id,
    text,
    completed: false
  }

  todos.push(todo)
  return c.json({ success: true, todo })
})
//ME (cek token / user login)
app.get('/api/me', c => {
  const user = auth(c)
  if (!user) return c.json({ success: false, message: 'Belum login' })
  return c.json({ success: true, user })
})

//404
app.notFound(c => c.text('404 - Tidak ditemukan'))

//UNTUK MENJALANKAN SERVER
serve({ fetch: app.fetch, port: 3001 }, () => {
  console.log('Server jalan di http://localhost:3001')
})
