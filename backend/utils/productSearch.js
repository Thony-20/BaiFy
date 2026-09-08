/**
 * Búsqueda de productos optimizada para minimizar lecturas de Firestore.
 * Máximo ~41 lecturas por búsqueda (2 batches × 20 + 1 cursor), típicamente 1–20.
 */

export const SEARCH_SCAN_LIMIT = 20;
export const MAX_KEYWORD_BATCHES = 2;
export const MIN_SEARCH_LENGTH = 2;
export const SEARCH_CACHE_TTL_SECONDS = 3 * 60;

const STOP_WORDS = new Set([
    'de', 'el', 'la', 'en', 'un', 'una', 'los', 'las', 'y', 'o', 'con', 'por', 'para', 'que'
]);

const COLLECTION = 'productos';

/**
 * @param {string} term
 * @returns {string}
 */
export function normalizeSearchTerm(term) {
    return String(term || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

/**
 * @param {string} term
 * @returns {string[]}
 */
export function tokenizeSearch(term) {
    const normalized = normalizeSearchTerm(term);
    const raw = normalized.split(/[^a-z0-9]+/).filter((w) => w.length >= MIN_SEARCH_LENGTH);
    const filtered = raw.filter((w) => !STOP_WORDS.has(w));
    return filtered.length > 0 ? filtered : raw;
}

/**
 * @param {string} term
 * @returns {boolean}
 */
export function isLikelySku(term) {
    const normalized = normalizeSearchTerm(term);
    if (normalized.length < MIN_SEARCH_LENGTH || /\s/.test(normalized)) return false;
    if (!/^[a-z0-9_-]+$/.test(normalized)) return false;
    // Solo códigos con dígitos o separadores; nombres de una palabra van por nombre/keywords
    return /\d/.test(normalized) || /[-_]/.test(normalized);
}

/**
 * @param {Record<string, unknown>} product
 * @param {string[]} words
 * @param {string|undefined} estado
 * @returns {boolean}
 */
export function matchesProductSearch(product, words, estado) {
    if (estado && product.estado !== estado) return false;
    if (words.length === 0) return true;

    const name = normalizeSearchTerm(String(product.nombre || ''));
    const sku = normalizeSearchTerm(String(product.sku || ''));
    return words.every((word) => name.includes(word) || sku.includes(word));
}

/**
 * @param {string[]} words
 * @returns {string}
 */
export function pickDiscriminantWord(words) {
    return [...words].sort((a, b) => b.length - a.length)[0];
}

/**
 * @param {Record<string, unknown>} payload
 * @returns {string}
 */
export function encodeSearchCursor(payload) {
    return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

/**
 * @param {string|undefined|null} cursor
 * @returns {{ offset: number } | null}
 */
export function decodeSearchCursor(cursor) {
    if (!cursor) return null;
    try {
        const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
        if (typeof parsed.offset === 'number' && parsed.offset >= 0) {
            return { offset: parsed.offset };
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * @param {string} empresaId
 * @param {string} search
 * @param {string|undefined} estado
 * @returns {string}
 */
export function buildSearchHitsCacheKey(empresaId, search, estado) {
    const estadoPart = estado || '_all_';
    const safeSearch = normalizeSearchTerm(search).replace(/[^a-z0-9_-]/g, '_').slice(0, 80);
    return `products-search-hits-${empresaId}-${estadoPart}-${safeSearch}`;
}

/**
 * @param {import('firebase-admin/firestore').Firestore} adminDb
 * @param {string} empresaId
 * @param {string} sku
 * @param {string|undefined} estado
 * @returns {Promise<import('firebase-admin/firestore').QueryDocumentSnapshot|null>}
 */
export async function findExactSkuSnapshot(adminDb, empresaId, sku, estado) {
    const skuSearch = normalizeSearchTerm(sku);
    const snapshot = await adminDb.collection(COLLECTION)
        .where('empresaId', '==', empresaId)
        .where('sku_search', '==', skuSearch)
        .limit(1)
        .get();

    if (snapshot.empty) return null;

    const doc = snapshot.docs[0];
    if (estado && doc.data().estado !== estado) return null;
    return doc;
}

/**
 * @param {import('firebase-admin/firestore').Firestore} adminDb
 * @param {string} empresaId
 * @param {string} term
 * @param {boolean} useSkuField
 * @param {number} scanLimit
 * @returns {Promise<import('firebase-admin/firestore').QueryDocumentSnapshot[]>}
 */
async function queryPrefixSnapshots(adminDb, empresaId, term, useSkuField, scanLimit) {
    const field = useSkuField ? 'sku_search' : 'nombre_search';
    const snapshot = await adminDb.collection(COLLECTION)
        .where('empresaId', '==', empresaId)
        .where(field, '>=', term)
        .where(field, '<=', `${term}\uf8ff`)
        .orderBy(field)
        .limit(scanLimit)
        .get();

    return snapshot.docs;
}

/**
 * @param {import('firebase-admin/firestore').Firestore} adminDb
 * @param {string} empresaId
 * @param {string} discriminantWord
 * @param {number} scanLimit
 * @param {string|null} firestoreDocId
 * @returns {Promise<import('firebase-admin/firestore').QueryDocumentSnapshot[]>}
 */
async function queryKeywordSnapshots(adminDb, empresaId, discriminantWord, scanLimit, firestoreDocId) {
    let query = adminDb.collection(COLLECTION)
        .where('empresaId', '==', empresaId)
        .where('keywords', 'array-contains', discriminantWord)
        .limit(scanLimit);

    if (firestoreDocId) {
        const lastSnap = await adminDb.collection(COLLECTION).doc(firestoreDocId).get();
        if (lastSnap.exists) {
            query = query.startAfter(lastSnap);
        }
    }

    const snapshot = await query.get();
    return snapshot.docs;
}

/**
 * @param {import('firebase-admin/firestore').QueryDocumentSnapshot[]} docs
 * @param {(data: Record<string, unknown>) => Record<string, unknown>} serializeProductDates
 * @param {string[]} words
 * @param {string|undefined} estado
 * @returns {Record<string, unknown>[]}
 */
function mapAndFilterDocs(docs, serializeProductDates, words, estado) {
    const seen = new Set();
    const results = [];

    for (const doc of docs) {
        if (seen.has(doc.id)) continue;
        seen.add(doc.id);

        const product = {
            id: doc.id,
            ...serializeProductDates(doc.data())
        };

        if (matchesProductSearch(product, words, estado)) {
            results.push(product);
        }
    }

    return results;
}

/**
 * Ejecuta la búsqueda en Firestore (sin caché). Devuelve todos los matches del scan.
 *
 * @param {object} params
 * @param {import('firebase-admin/firestore').Firestore} params.adminDb
 * @param {string} params.empresaId
 * @param {string} params.search
 * @param {string|undefined} params.estado
 * @param {(data: Record<string, unknown>) => Record<string, unknown>} params.serializeProductDates
 * @returns {Promise<{ products: Record<string, unknown>[], mayHaveMore: boolean }>}
 */
export async function fetchSearchHitsFromFirestore({
    adminDb,
    empresaId,
    search,
    estado,
    serializeProductDates
}) {
    const searchTerm = normalizeSearchTerm(search);
    const words = tokenizeSearch(search);

    if (searchTerm.length < MIN_SEARCH_LENGTH) {
        return { products: [], mayHaveMore: false };
    }

    // SKU exacto: 1 lectura
    if (isLikelySku(searchTerm) && searchTerm.length >= 3) {
        const exactDoc = await findExactSkuSnapshot(adminDb, empresaId, searchTerm, estado);
        if (exactDoc) {
            return {
                products: [{
                    id: exactDoc.id,
                    ...serializeProductDates(exactDoc.data())
                }],
                mayHaveMore: false
            };
        }
    }

    // Una palabra: keywords primero (soporta acentos), luego prefijo
    if (words.length <= 1) {
        const matchWords = words.length > 0 ? words : [searchTerm];
        const primaryWord = matchWords[0];

        let docs = await queryKeywordSnapshots(
            adminDb,
            empresaId,
            primaryWord,
            SEARCH_SCAN_LIMIT,
            null
        );

        let products = mapAndFilterDocs(docs, serializeProductDates, matchWords, estado);

        if (products.length === 0) {
            const useSkuField = isLikelySku(searchTerm);
            docs = await queryPrefixSnapshots(
                adminDb,
                empresaId,
                searchTerm,
                useSkuField,
                SEARCH_SCAN_LIMIT
            );
            products = mapAndFilterDocs(docs, serializeProductDates, matchWords, estado);

            if (products.length === 0 && useSkuField) {
                docs = await queryPrefixSnapshots(
                    adminDb,
                    empresaId,
                    searchTerm,
                    false,
                    SEARCH_SCAN_LIMIT
                );
                products = mapAndFilterDocs(docs, serializeProductDates, matchWords, estado);
            }
        }

        return {
            products,
            mayHaveMore: docs.length >= SEARCH_SCAN_LIMIT
        };
    }

    // Multi-palabra: array-contains con la palabra más discriminante (máx. 2 batches)
    const discriminantWord = pickDiscriminantWord(words);
    const allDocs = [];
    let firestoreDocId = null;
    let mayHaveMore = false;

    for (let batch = 0; batch < MAX_KEYWORD_BATCHES; batch++) {
        const batchDocs = await queryKeywordSnapshots(
            adminDb,
            empresaId,
            discriminantWord,
            SEARCH_SCAN_LIMIT,
            firestoreDocId
        );

        if (batchDocs.length === 0) break;

        allDocs.push(...batchDocs);
        firestoreDocId = batchDocs[batchDocs.length - 1].id;

        if (batchDocs.length < SEARCH_SCAN_LIMIT) break;
        if (batch < MAX_KEYWORD_BATCHES - 1) {
            mayHaveMore = true;
        }
    }

    const products = mapAndFilterDocs(allDocs, serializeProductDates, words, estado);

    if (products.length === 0) {
        const fallbackDocs = await queryPrefixSnapshots(
            adminDb,
            empresaId,
            searchTerm,
            false,
            SEARCH_SCAN_LIMIT
        );
        const fallbackProducts = mapAndFilterDocs(fallbackDocs, serializeProductDates, words, estado);
        return {
            products: fallbackProducts,
            mayHaveMore: fallbackDocs.length >= SEARCH_SCAN_LIMIT
        };
    }

    if (allDocs.length >= SEARCH_SCAN_LIMIT * MAX_KEYWORD_BATCHES) {
        mayHaveMore = true;
    }

    return { products, mayHaveMore };
}

/**
 * Pagina resultados ya obtenidos (desde caché o Firestore).
 *
 * @param {Record<string, unknown>[]} allProducts
 * @param {number} pageSize
 * @param {string|undefined|null} cursor
 * @param {boolean} mayHaveMore
 * @returns {{ products: Record<string, unknown>[], hasMore: boolean, nextCursor: string|null, lastDocId: string|null }}
 */
export function paginateSearchResults(allProducts, pageSize, cursor, mayHaveMore) {
    const cappedPageSize = Math.min(Math.max(pageSize, 1), 50);
    const cursorState = decodeSearchCursor(cursor);
    const offset = cursorState?.offset ?? 0;

    const pageProducts = allProducts.slice(offset, offset + cappedPageSize);
    const hasMoreInCache = offset + cappedPageSize < allProducts.length;
    const hasMore = hasMoreInCache || mayHaveMore;
    const lastProduct = pageProducts.length > 0 ? pageProducts[pageProducts.length - 1] : null;

    const nextCursor = hasMoreInCache
        ? encodeSearchCursor({ offset: offset + cappedPageSize })
        : null;

    return {
        products: pageProducts,
        hasMore,
        nextCursor,
        lastDocId: lastProduct && typeof lastProduct.id === 'string' ? lastProduct.id : null
    };
}
