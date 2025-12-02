// index.js
import 'dotenv/config';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { setCookie, getCookie } from 'hono/cookie';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from './db/index.js';
import { users, transactions } from './db/schema.js';
import { eq, desc, sql } from 'drizzle-orm';
import { serveStatic } from '@hono/node-server/serve-static';
 
const app = new Hono();
const SECRET = process.env.JWT_SECRET;
 
// --- API REGISTRASI ---
app.post('/api/register', async (c) => {
    try {
        const { username, password } = await c.req.json();
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await db.insert(users)
            .values({ username, password: hashedPassword })
            .returning({ id: users.id, username: users.username });
        return c.json({ success: true, data: newUser[0] }, 201);
    } catch (error) {
        return c.json({ success: false, message: 'Registrasi gagal' }, 400);
    }
});
 
// --- API LOGIN ---
app.post('/api/login', async (c) => {
    const { username, password } = await c.req.json();
    const user = await db.query.users.findFirst({ where: eq(users.username, username) });
 
    if (!user) return c.json({ success: false, message: 'Username atau password salah' }, 401);
    
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) return c.json({ success: false, message: 'Username atau password salah' }, 401);
 
    const token = jwt.sign({ id: user.id, username: user.username }, SECRET, { expiresIn: '1d' });
    setCookie(c, 'token', token, { httpOnly: true, sameSite: 'Lax', maxAge: 86400 });
    
    return c.json({ success: true, message: 'Login berhasil' });
});
 
// --- API LOGOUT ---
app.post('/api/logout', (c) => {
    setCookie(c, 'token', '', { maxAge: -1 });
    return c.json({ success: true, message: 'Logout berhasil' });
});
 
// --- MIDDLEWARE & API ME ---
app.get('/api/me', (c) => {
    const token = getCookie(c, 'token');
    if (!token) return c.json({ success: false, message: 'Unauthorized' }, 401);
    try {
        const user = jwt.verify(token, SECRET);
        return c.json({ success: true, data: user });
    } catch (error) {
        return c.json({ success: false, message: 'Token tidak valid' }, 401);
    }
});
app.use('/*', serveStatic({ root: './public' }));

// --- SERVER START ---
// Logika Vercel (akan ditambahkan nanti)
if (process.env.VERCEL) {
    globalThis.app = app;
} else {
    const port = 3000;
    console.log(`🚀 Server is running on http://localhost:${port}`);
    serve({ fetch: app.fetch, port });
}