// index.js
import 'dotenv/config';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { setCookie, getCookie } from 'hono/cookie';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from './db/index.js';
import { users, transactions } from './db/schema.js';
import { eq, sql, desc } from 'drizzle-orm';

const app = new Hono();
const SECRET = process.env.JWT_SECRET;

// Serve HTML pages
app.get('/login/', (c) => {
    const html = fs.readFileSync(path.join(process.cwd(), 'public/login/index.html'), 'utf-8');
    return c.html(html);
});

app.get('/register/', (c) => {
    const html = fs.readFileSync(path.join(process.cwd(), 'public/register/index.html'), 'utf-8');
    return c.html(html);
});

app.get('/logout/', (c) => {
    const html = fs.readFileSync(path.join(process.cwd(), 'public/logout/index.html'), 'utf-8');
    return c.html(html);
});

app.get('/todos/', (c) => {
    const html = fs.readFileSync(path.join(process.cwd(), 'public/todos/index.html'), 'utf-8');
    return c.html(html);
});

// ROUTE UTAMA (AGAR TIDAK 404)
app.get('/', (c) => {
    return c.text('');
});

// API REGISTRASI
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

// API LOGIN
app.post('/api/login', async (c) => {
    try {
        const { username, password } = await c.req.json();
        const user = await db.query.users.findFirst({ where: eq(users.username, username) });

        if (!user) return c.json({ success: false, message: 'Username atau password salah' }, 401);

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) return c.json({ success: false, message: 'Username atau password salah' }, 401);

        const token = jwt.sign({ id: user.id, username: user.username }, SECRET, { expiresIn: '1d' });
        setCookie(c, 'token', token, { httpOnly: true, sameSite: 'Lax', maxAge: 86400 });

        return c.json({ success: true, message: 'Login berhasil' });
    } catch (error) {
        return c.json({ success: false, message: 'Invalid JSON' }, 400);
    }
});

// API LOGOUT
app.post('/api/logout', (c) => {
    setCookie(c, 'token', '', { maxAge: -1 });
    return c.json({ success: true, message: 'Logout berhasil' });
});

// API ME
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
// index.js (Lanjutan)
// Fungsi untuk memverifikasi JWT dan mendapatkan ID Pengguna
const authMiddleware = async (c, next) => {
    const token = getCookie(c, 'token');
    if (!token) return c.json({ success: false, message: 'Unauthorized' }, 401);
    try {
        const user = jwt.verify(token, SECRET);
        c.set('user', user); // Menyimpan data user di context Hono
        await next();
    } catch (error) {
        return c.json({ success: false, message: 'Token tidak valid' }, 401);
    }
};
 
// --- API  (POST) ---
app.post('/api/transactions', authMiddleware, async (c) => {
    let body;
    try {
        body = await c.req.json();
    } catch (error) {
        return c.json({ success: false, message: 'Invalid JSON' }, 400);
    }
    try {
        const user = c.get('user');
        const { nominal, transactionDate, status, description } = body;
        const newTransaction = await db.insert(transactions)
            .values({
                userId: user.id,
                nominal: nominal.toString(), // Simpan nominal sebagai string
                transactionDate: transactionDate,
                status: status,
                description: description
            })
            .returning();
        return c.json({ success: true, data: newTransaction[0] }, 201);
    } catch (error) {
        console.error("error", error);
        return c.json({ success: false, message: 'Gagal menambah transaksi' }, 400);
    }
});

// --- API LIHAT TRANSAKSI PER BULAN (GET) ---
app.get('/api/transactions', authMiddleware, async (c) => {
    try {
        const user = c.get('user');
        const { year, month } = c.req.query(); // Ambil tahun dan bulan dari query string
        
        if (!year || !month) return c.json({ success: false, message: 'Tahun dan bulan wajib diisi' }, 400);

        // Filter berdasarkan user_id DAN rentang bulan
        const startOfMonth = `${year}-${month.padStart(2, '0')}-01 00:00:00`;
        const endOfMonth = sql`${startOfMonth} + interval '1 month'`;

        const userTransactions = await db.query.transactions.findMany({
            where: (t, { eq, and, gte, lt }) => and(
                eq(t.userId, user.id),
                gte(t.transactionDate, startOfMonth),
                lt(t.transactionDate, endOfMonth)
            ),
            orderBy: desc(transactions.transactionDate),
        });

        // Hitung Total Laporan Keuangan
        const totalIncome = userTransactions
            .filter(t => t.status === 'income')
            .reduce((sum, t) => sum + parseFloat(t.nominal), 0);
        
        const totalOutcome = userTransactions
            .filter(t => t.status === 'outcome')
            .reduce((sum, t) => sum + parseFloat(t.nominal), 0);
        
        const balance = totalIncome - totalOutcome;

        return c.json({ 
            success: true, 
            data: userTransactions, 
            summary: { totalIncome, totalOutcome, balance } 
        });
    } catch (error) {
        console.error("error", error);
        return c.json({ success: false, message: 'Gagal mengambil transaksi' }, 500);
    }
});

// --- ROOT URL dan SERVE STATIC FILES (untuk UI) ---
app.get('/', (c) => {
    return c.html('<h1>Financial Tracker API is Running!</h1>');
});


// SERVER START
if (process.env.VERCEL) {
    globalThis.app = app;
} else {
    const port = 3001;
    console.log(`🚀 Server berjalan di http://localhost:${port}`);
    serve({ fetch: app.fetch, port });
}
