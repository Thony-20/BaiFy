/**
 * Mide lecturas Firestore por sección (cold vs warm con Redis).
 *
 * Uso (desde backend/):
 *   node scripts/measure_section_reads.js
 *   node scripts/measure_section_reads.js --empresaId=XXX
 *
 * Requiere serviceAccountKey.json y preferiblemente Upstash configurado.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

process.env.METER_FIRESTORE_READS = '1';

dotenv.config({ quiet: true });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
process.chdir(backendRoot);

const { runWithMeter } = await import('../utils/readMeter.js');
const { statsCache } = await import('../utils/cache.js');
const { adminDb } = await import('../config/firebase.js');

const { getDashboardStats } = await import('../controllers/stock.controller.js');
const { getRecentMovimientos } = await import('../controllers/stock.controller.js');
const {
    getProducts,
    getLowStockProducts,
    getExpiringProducts,
    getExpiredProducts,
} = await import('../controllers/product.controller.js');
const {
    getSalesHistory,
    getSalesStats,
    getProductRanking,
} = await import('../controllers/sale.controller.js');
const { getClientsAnalytics, getClientAnalytics } = await import('../controllers/client.controller.js');
const { getAccounts, getAccountStats } = await import('../controllers/account.controller.js');
const { listNotifications } = await import('../controllers/notification.controller.js');

function parseArgs(argv) {
    const out = {};
    for (const arg of argv) {
        if (!arg.startsWith('--')) continue;
        const [k, ...rest] = arg.slice(2).split('=');
        out[k] = rest.length ? rest.join('=') : true;
    }
    return out;
}

function createMockRes() {
    const res = {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
    };
    return res;
}

async function invoke(handler, query = {}, params = {}) {
    const req = { query, params, user: { uid: 'measure-script' }, headers: {} };
    const res = createMockRes();
    await handler(req, res);
    if (res.statusCode >= 400) {
        const errMsg = res.body?.error || res.body?.message || JSON.stringify(res.body);
        throw new Error(`HTTP ${res.statusCode}: ${errMsg}`);
    }
    return res.body;
}

async function clearEmpresaCaches(empresaId) {
    const prefixes = [
        `dashboard-${empresaId}`,
        `sales-${empresaId}`,
        `history-${empresaId}`,
        `ranking-${empresaId}`,
        `products-all-${empresaId}`,
        `products-lowstock-${empresaId}`,
        `products-expiring-${empresaId}`,
        `products-expired-${empresaId}`,
        `products-search-${empresaId}`,
        `products-search-hits-${empresaId}`,
        `notifications-${empresaId}`,
    ];
    await Promise.all(prefixes.map((p) => statsCache.clearByPrefix(p)));
}

function todayISO() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Caracas',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date());
}

function daysAgoISO(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Caracas',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(d);
}

/**
 * @typedef {{ id: string, label: string, cached: boolean, run: (ctx: object) => Promise<object|void> }} Section
 */

/** @type {Section[]} */
const SECTIONS = [
    {
        id: 'notifications',
        label: 'Notificaciones (global)',
        cached: true,
        run: async ({ empresaId }) => {
            await invoke(listNotifications, { empresaId });
        },
    },
    {
        id: 'dashboard',
        label: 'Dashboard',
        cached: true,
        run: async ({ empresaId, from, to }) => {
            await Promise.all([
                invoke(getDashboardStats, { empresaId, from, to }),
                invoke(getLowStockProducts, { empresaId, pageSize: '5' }),
                invoke(getExpiringProducts, { empresaId, pageSize: '5', months: '2' }),
                invoke(getExpiredProducts, { empresaId, pageSize: '5' }),
            ]);
        },
    },
    {
        id: 'productos',
        label: 'Productos',
        cached: true,
        run: async ({ empresaId }) => {
            await invoke(getProducts, { empresaId, pageSize: '20' });
        },
    },
    {
        id: 'pos',
        label: 'POS / historial',
        cached: true,
        run: async ({ empresaId }) => {
            await Promise.all([
                invoke(getProducts, { empresaId, pageSize: '20' }),
                invoke(getSalesHistory, { empresaId, limit: '20' }),
            ]);
        },
    },
    {
        id: 'ventas_metricas',
        label: 'Métricas de ventas',
        cached: true,
        run: async ({ empresaId, from, to }) => {
            await Promise.all([
                invoke(getSalesStats, { empresaId, from, to }),
                invoke(getProductRanking, { empresaId, type: 'top', limit: '10', page: '1' }),
                invoke(getRecentMovimientos, { empresaId, limitCount: '20' }),
            ]);
        },
    },
    {
        id: 'clientes',
        label: 'Clientes (analytics)',
        cached: false,
        run: async (ctx) => {
            const { empresaId } = ctx;
            const body = await invoke(getClientsAnalytics, { empresaId });
            const first =
                body?.clients?.[0]?.id ||
                body?.clients?.[0]?.clienteId ||
                body?.items?.[0]?.id ||
                body?.data?.[0]?.id ||
                null;
            if (first) ctx.sampleClientId = first;
            return body;
        },
    },
    {
        id: 'cliente_detalle',
        label: 'Cliente detalle',
        cached: false,
        run: async (ctx) => {
            const { empresaId } = ctx;
            let clientId = ctx.sampleClientId;
            if (!clientId) {
                const snap = await adminDb
                    .collection('clientes')
                    .where('empresaId', '==', empresaId)
                    .limit(1)
                    .get();
                clientId = snap.docs[0]?.id || null;
            }
            if (!clientId) {
                return { skipped: true, reason: 'Sin clientes' };
            }
            ctx.sampleClientId = clientId;
            await invoke(getClientAnalytics, { empresaId }, { id: clientId });
        },
    },
    {
        id: 'cuentas',
        label: 'Cuentas',
        cached: false,
        run: async ({ empresaId }) => {
            await Promise.all([
                invoke(getAccounts, { empresaId, tipo: 'por_cobrar', pageSize: '20' }),
                invoke(getAccountStats, { empresaId, tipo: 'por_cobrar' }),
            ]);
        },
    },
];

async function measurePass(passName, sections, ctx) {
    const rows = [];
    for (const section of sections) {
        process.stdout.write(`  [${passName}] ${section.label}... `);
        const { meter, result } = await runWithMeter(async () => section.run(ctx));
        const skipped = result && result.skipped;
        const row = {
            id: section.id,
            label: section.label,
            expectsCache: section.cached,
            skipped: Boolean(skipped),
            reads: meter.reads,
            cacheHits: meter.cacheHits,
            cacheMisses: meter.cacheMisses,
        };
        rows.push(row);
        console.log(
            skipped
                ? `omitido (${result.reason})`
                : `reads=${meter.reads} hits=${meter.cacheHits} misses=${meter.cacheMisses}`
        );
    }
    return rows;
}

function pct(saved, cold) {
    if (!cold || cold <= 0) return 0;
    return Math.round((saved / cold) * 1000) / 10;
}

function mergeReport(coldRows, warmRows) {
    return coldRows.map((cold, i) => {
        const warm = warmRows[i];
        const saved = Math.max(0, cold.reads - warm.reads);
        return {
            id: cold.id,
            label: cold.label,
            expectsCache: cold.expectsCache,
            skipped: cold.skipped || warm.skipped,
            coldReads: cold.reads,
            warmReads: warm.reads,
            coldCacheHits: cold.cacheHits,
            warmCacheHits: warm.cacheHits,
            savedReads: saved,
            savingsPct: pct(saved, cold.reads),
        };
    });
}

function printTable(merged) {
    console.log('\n=== Reporte lecturas Firestore por sección ===\n');
    console.log(
        'Sección'.padEnd(28) +
        'Cold'.padStart(8) +
        'Warm'.padStart(8) +
        'Ahorro'.padStart(8) +
        '%'.padStart(8) +
        '  Cache?'
    );
    console.log('-'.repeat(72));
    for (const row of merged) {
        if (row.skipped) {
            console.log(`${row.label.padEnd(28)} (omitido)`);
            continue;
        }
        console.log(
            row.label.padEnd(28) +
            String(row.coldReads).padStart(8) +
            String(row.warmReads).padStart(8) +
            String(row.savedReads).padStart(8) +
            `${row.savingsPct}%`.padStart(8) +
            (row.expectsCache ? '  sí' : '  no')
        );
    }
    const totalCold = merged.reduce((s, r) => s + (r.skipped ? 0 : r.coldReads), 0);
    const totalWarm = merged.reduce((s, r) => s + (r.skipped ? 0 : r.warmReads), 0);
    const totalSaved = Math.max(0, totalCold - totalWarm);
    console.log('-'.repeat(72));
    console.log(
        'TOTAL tour'.padEnd(28) +
        String(totalCold).padStart(8) +
        String(totalWarm).padStart(8) +
        String(totalSaved).padStart(8) +
        `${pct(totalSaved, totalCold)}%`.padStart(8)
    );
    return { totalCold, totalWarm, totalSaved, totalSavingsPct: pct(totalSaved, totalCold) };
}

async function resolveEmpresaId(cliId) {
    if (cliId && typeof cliId === 'string') return cliId;

    // Prefer empresa vista en logs de dev recientes
    const preferred = 'tpGXeLloTLZuLgwpoNHR';
    const preferredSnap = await adminDb.collection('empresas').doc(preferred).get();
    if (preferredSnap.exists) return preferred;

    const snap = await adminDb.collection('empresas').limit(1).get();
    if (snap.empty) throw new Error('No hay empresas en Firestore');
    return snap.docs[0].id;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const empresaId = await resolveEmpresaId(args.empresaId);
    const from = typeof args.from === 'string' ? args.from : daysAgoISO(30);
    const to = typeof args.to === 'string' ? args.to : todayISO();

    const redisConfigured = Boolean(
        process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    );

    console.log(`Empresa: ${empresaId}`);
    console.log(`Rango: ${from} → ${to}`);
    console.log(`Redis Upstash: ${redisConfigured ? 'configurado' : 'NO configurado (warm ≈ cold)'}`);

    const ctx = {
        empresaId,
        from,
        to,
        sampleClientId: null,
    };

    console.log('\nLimpiando caché Redis de la empresa (cold)...');
    await clearEmpresaCaches(empresaId);

    console.log('\nPasada COLD (sin caché útil):');
    const coldRows = await measurePass('cold', SECTIONS, ctx);

    console.log('\nPasada WARM (caché poblada):');
    const warmRows = await measurePass('warm', SECTIONS, ctx);

    const sections = mergeReport(coldRows, warmRows);
    const totals = printTable(sections);

    const report = {
        generatedAt: new Date().toISOString(),
        empresaId,
        from,
        to,
        redisConfigured,
        sections,
        totals,
        notes: [
            'Cold = caché Redis invalidada para prefijos de la empresa.',
            'Warm = misma matriz inmediatamente después (hit Redis donde exista).',
            'Secciones sin caché (notificaciones, clientes, cuentas) deberían mostrar ~0% ahorro.',
            'Las lecturas de transaction.get no están instrumentadas en esta pasada.',
            'Aggregations count() se estiman como ceil(count/1000) lecturas (billing Firestore).',
        ],
    };

    const outDir = path.join(backendRoot, 'scratch');
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, 'firestore-reads-report.json');
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(`\nReporte JSON: ${outPath}`);
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('\nError midiendo lecturas:', err);
        process.exit(1);
    });
