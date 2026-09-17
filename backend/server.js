import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes.js';
import productsRoutes from './routes/products.routes.js';
import stockRoutes from './routes/stock.routes.js';
import adminRoutes from './routes/admin.routes.js';
import salesRoutes from './routes/sales.routes.js';
import accountsRoutes from './routes/accounts.routes.js';
import clientsRoutes from './routes/clients.routes.js';
import notificationsRoutes from './routes/notifications.routes.js';
import chatRoutes from './routes/chat.routes.js';
import { firestoreMeterMiddleware } from './utils/readMeter.js';

dotenv.config({ quiet: true });

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(firestoreMeterMiddleware);

// Rutas
app.use('/api/auth', authRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/chat', chatRoutes);

export default app;

const isVercel = Boolean(process.env.VERCEL);

if (!isVercel) {
    const PORT = Number(process.env.PORT) || 3000;
    const HOST = process.env.HOST || '127.0.0.1';

    process.on('unhandledRejection', (reason, promise) => {
        console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    process.on('uncaughtException', (err) => {
        console.error('Uncaught Exception thrown:', err);
        process.exit(1);
    });

    const server = app.listen(PORT, HOST, () => {
        console.log(`Servidor corriendo en http://${HOST}:${PORT}`);
    });

    server.on('error', (err) => {
        // Evita matar un listen ya exitoso por errores espurios de dual-stack en Windows.
        if (server.listening) {
            console.warn('Aviso del servidor (ignorado porque ya está escuchando):', err.code || err.message);
            return;
        }

        if (err.code === 'EADDRINUSE') {
            console.error(
                `Puerto ${PORT} ya está en uso. Cierra el otro npm run dev / proceso node, o usa: npm run dev:clean`
            );
            process.exit(1);
        }

        console.error('Error al iniciar el servidor:', err);
        process.exit(1);
    });

    process.on('SIGTERM', () => {
        console.log('SIGTERM signal received: closing HTTP server');
        server.close(() => {
            console.log('HTTP server closed');
        });
    });

    process.on('SIGINT', () => {
        server.close(() => {
            process.exit(0);
        });
    });
}
