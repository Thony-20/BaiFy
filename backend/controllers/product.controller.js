import { adminDb } from '../config/firebase.js';
import { statsCache } from '../utils/cache.js';
import { FieldValue } from 'firebase-admin/firestore';
import { getStartOfDayCaracas, normalizeToCaracasMidnight } from '../utils/dateUtils.js';
import { applyEmpresaStatsDelta } from '../utils/empresaStats.js';
import {
    MIN_SEARCH_LENGTH,
    SEARCH_CACHE_TTL_SECONDS,
    buildSearchHitsCacheKey,
    fetchSearchHitsFromFirestore,
    findExactSkuSnapshot,
    normalizeSearchTerm,
    paginateSearchResults
} from '../utils/productSearch.js';
import { clearProductCaches } from '../utils/productCache.js';

const COLLECTION = 'productos';
const PRODUCTS_PER_PAGE = 10;

// Ayudante para validar que las fechas estén dentro del rango permitido por Firestore
// Rango: Año 1 al 9999 (Seconds: [-62135596800, 253402300799])
const safeGetDate = (val) => {
    const date = normalizeToCaracasMidnight(val);
    if (!date) return null;

    const seconds = Math.floor(date.getTime() / 1000);
    if (seconds < -62135596800 || seconds > 253402300799) {
        return null;
    }
    return date;
};

// Generador de palabras clave para búsqueda robusta (ahora incluye SKU)
const generateSearchKeywords = (nombre, sku = '') => {
    const text = `${nombre} ${sku}`;
    if (!text.trim()) return [];
    const normalized = text.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
    
    const words = normalized.split(/[^a-z0-9]+/).filter(w => w.length >= 2);
    return Array.from(new Set(words)); // Palabras únicas
};

/** Serializa Timestamps de Firestore a ISO para respuestas JSON consistentes */
const serializeProductDates = (data) => {
    const serialized = { ...data };
    if (serialized.createdAt && serialized.createdAt.toDate) {
        serialized.createdAt = serialized.createdAt.toDate().toISOString();
    }
    if (serialized.updatedAt && serialized.updatedAt.toDate) {
        serialized.updatedAt = serialized.updatedAt.toDate().toISOString();
    }
    if (serialized.fechaVencimiento) {
        const normalized = normalizeToCaracasMidnight(serialized.fechaVencimiento);
        serialized.fechaVencimiento = normalized ? normalized.toISOString() : null;
    }
    return serialized;
};

export const getProductBySku = async (req, res) => {
    try {
        const empresaId = req.query.empresaId;
        const sku = req.query.sku;
        const estado = req.query.estado;

        if (!empresaId || !sku) {
            return res.status(400).json({ error: 'empresaId y sku son requeridos' });
        }

        const doc = await findExactSkuSnapshot(adminDb, empresaId, sku.trim(), estado);
        if (!doc) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }

        res.status(200).json({
            id: doc.id,
            ...serializeProductDates(doc.data())
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getProducts = async (req, res) => {
    try {
        const empresaId = req.query.empresaId;
        const estado = req.query.estado;
        const lastDocId = req.query.lastDocId;
        const search = req.query.search;
        const cursor = req.query.cursor;
        const pageSize = Math.min(parseInt(req.query.pageSize) || PRODUCTS_PER_PAGE, 50);

        if (!empresaId) return res.status(400).json({ error: "empresaId es requerido" });

        if (search) {
            const searchTerm = search.trim();

            if (normalizeSearchTerm(searchTerm).length < MIN_SEARCH_LENGTH) {
                return res.status(200).json({
                    products: [],
                    lastDocId: null,
                    nextCursor: null,
                    hasMore: false
                });
            }

            const hitsCacheKey = buildSearchHitsCacheKey(empresaId, searchTerm, estado);
            const cachedHits = await statsCache.get(hitsCacheKey);

            let allProducts;
            let mayHaveMore;

            if (cachedHits && Array.isArray(cachedHits.products)) {
                allProducts = cachedHits.products;
                mayHaveMore = Boolean(cachedHits.mayHaveMore);
            } else {
                const searchResult = await fetchSearchHitsFromFirestore({
                    adminDb,
                    empresaId,
                    search: searchTerm,
                    estado,
                    serializeProductDates
                });
                allProducts = searchResult.products;
                mayHaveMore = searchResult.mayHaveMore;

                if (allProducts.length > 0) {
                    await statsCache.set(
                        hitsCacheKey,
                        { products: allProducts, mayHaveMore },
                        SEARCH_CACHE_TTL_SECONDS
                    );
                }
            }

            const paginated = paginateSearchResults(allProducts, pageSize, cursor, mayHaveMore);
            return res.status(200).json(paginated);
        }

        // --- LÓGICA NORMAL SIN BÚSQUEDA ---
        let query = adminDb.collection(COLLECTION).where('empresaId', '==', empresaId);

        if (estado) {
            query = query.where('estado', '==', estado);
        }
        query = query.orderBy('createdAt', 'desc');

        if (lastDocId) {
            const lastDocSnap = await adminDb.collection(COLLECTION).doc(lastDocId).get();
            if (lastDocSnap.exists) {
                query = query.startAfter(lastDocSnap);
            }
        }

        const fetchLimit = pageSize + 1;
        query = query.limit(fetchLimit);
        const snapshot = await query.get();

        const allDocs = snapshot.docs.map(doc => ({
            id: doc.id,
            ...serializeProductDates(doc.data()),
        }));

        const products = allDocs.slice(0, pageSize);
        const lastDoc = products.length > 0 ? snapshot.docs.find(d => d.id === products[products.length - 1].id) || null : null;

        res.status(200).json({
            products,
            lastDocId: lastDoc?.id || null,
            nextCursor: null,
            hasMore: allDocs.length > pageSize
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getAllProducts = async (req, res) => {
    try {
        const empresaId = req.query.empresaId;
        const lastDocId = req.query.lastDocId;
        const pageSize = Math.min(parseInt(req.query.pageSize) || 50, 100);

        if (!empresaId) return res.status(400).json({ error: "empresaId es requerido" });

        const cacheKey = `products-all-${empresaId}-${pageSize}`;
        if (!lastDocId) {
            const cachedData = await statsCache.get(cacheKey);
            if (cachedData) return res.status(200).json(cachedData);
        }

        let query = adminDb.collection(COLLECTION)
            .where('empresaId', '==', empresaId)
            .orderBy('createdAt', 'desc');

        if (lastDocId) {
            const lastDocSnap = await adminDb.collection(COLLECTION).doc(lastDocId).get();
            if (lastDocSnap.exists) {
                query = query.startAfter(lastDocSnap);
            }
        }

        const snapshot = await query.limit(pageSize + 1).get();
        const docs = snapshot.docs.slice(0, pageSize);
        const products = docs.map(doc => {
            const data = doc.data();
            return { id: doc.id, ...serializeProductDates(data) };
        });

        const responseData = {
            products,
            lastDocId: products.length > 0 ? products[products.length - 1].id : null,
            hasMore: snapshot.docs.length > pageSize
        };

        if (!lastDocId) await statsCache.set(cacheKey, responseData);

        res.status(200).json(responseData);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getProductById = async (req, res) => {
    try {
        const { id } = req.params;
        const docSnap = await adminDb.collection(COLLECTION).doc(id).get();
        if (docSnap.exists) {
            const data = docSnap.data();
            if (data.createdAt && data.createdAt.toDate) data.createdAt = data.createdAt.toDate().toISOString();
            if (data.updatedAt && data.updatedAt.toDate) data.updatedAt = data.updatedAt.toDate().toISOString();
            if (data.fechaVencimiento && data.fechaVencimiento.toDate) data.fechaVencimiento = data.fechaVencimiento.toDate().toISOString();
            return res.status(200).json({ id: docSnap.id, ...data });
        }
        res.status(404).json({ error: "Producto no encontrado" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

import { PLAN_LIMITS } from '../utils/constants.js';

export const createProduct = async (req, res) => {
    try {
        const data = req.body;
        if (!data.empresaId || !data.nombre) {
            return res.status(400).json({ error: "Nombre y empresaId son requeridos" });
        }

        if (data.nombre.length > 120) {
            return res.status(400).json({ error: "el nombre del producto no puede exceder los 120 caracteres" });
        }

        if (parseFloat(data.valor || 0) < parseFloat(data.costo || 0)) {
            return res.status(400).json({ error: "El precio de venta no puede ser menor al costo unitario" });
        }

        const productData = {
            nombre: String(data.nombre || '').trim(),
            nombre_search: normalizeSearchTerm(data.nombre || ''),
            sku: (data.sku || '').trim(),
            sku_search: normalizeSearchTerm(data.sku || ''),
            keywords: generateSearchKeywords(data.nombre, data.sku), // NUEVO: Indexación Nombre + SKU
            descripcion: data.descripcion || '',
            valor: parseFloat(data.valor) || 0,
            costo: parseFloat(data.costo) || 0,
            stock: parseInt(data.stock) || 0,
            estado: data.estado || 'activo',
            ubicacion: data.ubicacion || '',
            fechaVencimiento: safeGetDate(data.fechaVencimiento),
            empresaId: data.empresaId,
            atributos: data.atributos || {},
            unitsSoldTotal: 0, // Inicializar contador maestro de ventas
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const result = await adminDb.runTransaction(async (transaction) => {
            const empresaRef = adminDb.collection('empresas').doc(data.empresaId);
            const empresaSnap = await transaction.get(empresaRef);
            
            if (!empresaSnap.exists) throw new Error("Empresa no encontrada");
            
            const planId = empresaSnap.data().planId || 'free';
            const limit = PLAN_LIMITS[planId] || PLAN_LIMITS['free'];

            if (limit !== Infinity) {
                const countQuery = adminDb.collection(COLLECTION).where('empresaId', '==', data.empresaId);
                const countSnap = await transaction.get(countQuery.count());
                const currentCount = countSnap.data().count;

                if (currentCount >= limit) {
                    const err = new Error(`Límite de productos alcanzado (${limit})`);
                    err.limitReached = true;
                    throw err;
                }
            }

            if (productData.sku) {
                const skuQuery = adminDb.collection(COLLECTION)
                    .where('empresaId', '==', data.empresaId)
                    .where('sku', '==', productData.sku)
                    .limit(1);
                const skuSnap = await transaction.get(skuQuery);
                if (!skuSnap.empty) throw new Error("El SKU ya está en uso");
            }

            const docRef = adminDb.collection(COLLECTION).doc();
            
            const stock = parseInt(productData.stock) || 0;
            const valor = parseFloat(productData.valor) || 0;
            const costo = parseFloat(productData.costo) || 0;
            
            const finalProduct = {
                ...productData,
                stock,
                valor,
                costo,
                totalValue: stock * valor,
                totalCostValue: stock * costo,
                updatedAt: new Date(),
                createdAt: new Date()
            };

            transaction.set(docRef, finalProduct);

            const addValue = finalProduct.totalValue;
            const addCost = finalProduct.totalCostValue;
            
            applyEmpresaStatsDelta(transaction, data.empresaId, {
                totalInventoryValue: addValue,
                totalCostValue: addCost,
                totalStock: stock,
                productCount: 1
            });

            return { id: docRef.id, ...finalProduct };
        });

        await clearProductCaches(data.empresaId);

        res.status(201).json(result);
    } catch (error) {
        if (error.limitReached) {
            return res.status(403).json({ error: error.message, limitReached: true });
        }
        res.status(500).json({ error: error.message });
    }
};

export const updateProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;

        const result = await adminDb.runTransaction(async (transaction) => {
            const productRef = adminDb.collection(COLLECTION).doc(id);
            const productSnap = await transaction.get(productRef);
            
            if (!productSnap.exists) throw new Error("Producto no encontrado");
            const currentData = productSnap.data();
            const empresaId = currentData.empresaId;

            const updateData = {
                ...data,
                updatedAt: new Date()
            };

            if (data.nombre) {
                if (data.nombre.length > 120) {
                    throw new Error("el nombre del producto no puede exceder los 120 caracteres");
                }
                updateData.nombre = String(data.nombre).trim();
                updateData.nombre_search = normalizeSearchTerm(updateData.nombre);
                // Si cambia el nombre, regeneramos con el SKU actual o el nuevo
                const currentSku = data.sku !== undefined ? data.sku : (currentData.sku || '');
                updateData.keywords = generateSearchKeywords(updateData.nombre, currentSku);
            }
            
            if (data.sku !== undefined) {
                updateData.sku = String(data.sku).trim();
                updateData.sku_search = normalizeSearchTerm(updateData.sku);
                // Si cambia el SKU, regeneramos con el nombre actual o el nuevo
                const currentNombre = data.nombre !== undefined ? data.nombre : (currentData.nombre || '');
                updateData.keywords = generateSearchKeywords(currentNombre, updateData.sku);
            }
            if (data.ubicacion !== undefined) updateData.ubicacion = String(data.ubicacion).trim();
            if (data.fechaVencimiento !== undefined) {
                updateData.fechaVencimiento = safeGetDate(data.fechaVencimiento);
            }

            if (data.valor !== undefined) updateData.valor = parseFloat(data.valor) || 0;
            if (data.costo !== undefined) updateData.costo = parseFloat(data.costo) || 0;
            if (data.stock !== undefined) updateData.stock = parseInt(data.stock) || 0;

            const checkValor = updateData.valor !== undefined ? updateData.valor : (currentData.valor || 0);
            const checkCosto = updateData.costo !== undefined ? updateData.costo : (currentData.costo || 0);

            if (checkValor < checkCosto) {
                throw new Error("El precio de venta no puede ser menor al costo unitario");
            }

            delete updateData.empresaId;
            delete updateData.id;
            delete updateData.createdAt;
            Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

            if (updateData.sku !== undefined && updateData.sku !== "") {
                const skuQuery = adminDb.collection(COLLECTION)
                    .where('empresaId', '==', empresaId)
                    .where('sku', '==', updateData.sku.trim());
                const skuSnap = await transaction.get(skuQuery);
                const duplicate = skuSnap.docs.find(doc => doc.id !== id);
                if (duplicate) throw new Error("El SKU ya está en uso");
            }

            const oldStock = parseInt(currentData.stock) || 0;
            const oldValor = parseFloat(currentData.valor) || 0;
            const oldCosto = parseFloat(currentData.costo) || 0;
            const oldTotalValue = oldStock * oldValor;
            const oldTotalCost = oldStock * oldCosto;

            const newStock = updateData.stock !== undefined ? parseInt(updateData.stock) || 0 : oldStock;
            const newValor = updateData.valor !== undefined ? parseFloat(updateData.valor) || 0 : oldValor;
            const newCosto = updateData.costo !== undefined ? parseFloat(updateData.costo) || 0 : oldCosto;
            const newTotalValue = newStock * newValor;
            const newTotalCost = newStock * newCosto;

            const diffTotalValue = newTotalValue - oldTotalValue;
            const diffTotalCost = newTotalCost - oldTotalCost;

            // Guardar campos calculados en el producto para agregación nativa
            updateData.totalValue = newTotalValue;
            updateData.totalCostValue = newTotalCost;

            transaction.update(productRef, updateData);

            // 3. REGISTRAR MOVIMIENTO SI EL STOCK CAMBIÓ
            const stockDiff = newStock - oldStock;
            if (stockDiff !== 0) {
                const movimientoRef = adminDb.collection('movimientos_stock').doc();
                const cantidadAbs = Math.abs(stockDiff);
                const tipoMov = stockDiff > 0 ? 'incremento' : 'reduccion';
                
                transaction.set(movimientoRef, {
                    productoId: id,
                    productoNombre: updateData.nombre || currentData.nombre || 'Producto',
                    productoSku: updateData.sku || currentData.sku || null,
                    tipo: tipoMov,
                    cantidad: cantidadAbs,
                    stockAnterior: oldStock,
                    stockNuevo: newStock,
                    usuarioId: req.user?.uid || 'unknown',
                    empresaId,
                    motivo: 'Ajuste manual (Edición)',
                    notas: 'Cambio de stock desde el formulario de edición',
                    fecha: new Date()
                });

                // --- AGREGADORES EFICIENTES ---
                const dateStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Caracas' });
                
                // 1. Métricas Globales de Stock (Entradas/Salidas)
                const dailyStockRef = adminDb.collection('metricas_stock_diarias').doc(`${dateStr}_${empresaId}`);
                transaction.set(dailyStockRef, {
                    date: dateStr,
                    empresaId: empresaId,
                    entradas: FieldValue.increment(tipoMov === 'incremento' ? cantidadAbs : 0),
                    salidas: FieldValue.increment(tipoMov === 'reduccion' ? cantidadAbs : 0)
                }, { merge: true });

                // 2. Métricas por Producto (Volumen de movimiento)
                const productStatRef = adminDb.collection('metricas_productos_diarias').doc(`${dateStr}_${id}`);
                transaction.set(productStatRef, {
                    date: dateStr,
                    empresaId: empresaId,
                    productId: id,
                    productName: updateData.nombre || currentData.nombre || 'Producto',
                    sku: updateData.sku || currentData.sku || '',
                    stockMoved: FieldValue.increment(cantidadAbs)
                }, { merge: true });
            }

            applyEmpresaStatsDelta(transaction, empresaId, {
                totalInventoryValue: diffTotalValue,
                totalCostValue: diffTotalCost,
                totalStock: stockDiff
            });

            return { id, empresaId, ...updateData };
        });

        if (result.empresaId) {
            await clearProductCaches(result.empresaId);
        }

        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;
        let empresaIdToClear = null;

        await adminDb.runTransaction(async (transaction) => {
            const productRef = adminDb.collection(COLLECTION).doc(id);
            const productSnap = await transaction.get(productRef);
            
            if (!productSnap.exists) return; // Ya borrado

            const data = productSnap.data();
            const empresaId = data.empresaId;
            empresaIdToClear = empresaId;
            const oldStock = parseInt(data.stock) || 0;
            const oldValor = parseFloat(data.valor) || 0;
            const oldCosto = parseFloat(data.costo) || 0;
            const valueToRemove = oldStock * oldValor;
            const costToRemove = oldStock * oldCosto;

            transaction.delete(productRef);

            applyEmpresaStatsDelta(transaction, empresaId, {
                totalInventoryValue: -valueToRemove,
                totalCostValue: -costToRemove,
                totalStock: -oldStock,
                productCount: -1
            });
        });

        if (empresaIdToClear) {
            await clearProductCaches(empresaIdToClear);
        }

        res.status(200).json({ message: "Producto eliminado exitosamente" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const bulkUpsertProducts = async (req, res) => {
    try {
        const { empresaId, products } = req.body;
        if (!empresaId || !products || !Array.isArray(products)) {
            return res.status(400).json({ error: "Faltan parámetros requeridos o formato inválido" });
        }

        const empresaDoc = await adminDb.collection('empresas').doc(empresaId).get();
        if (!empresaDoc.exists) {
            return res.status(404).json({ error: "Empresa no encontrada" });
        }
        const planId = empresaDoc.data().planId || 'free';
        const limit = PLAN_LIMITS[planId] || PLAN_LIMITS['free'];

        let currentCount = 0;
        if (limit !== Infinity) {
            const countSnapshot = await adminDb.collection(COLLECTION)
                .where('empresaId', '==', empresaId)
                .count()
                .get();
            currentCount = countSnapshot.data().count;

            if (currentCount + products.length > limit) {
                return res.status(403).json({
                    error: `La importación supera el límite de productos. Tu plan (${planId}) permite un máximo de ${limit} productos y ya posees ${currentCount}.`,
                    limitReached: true,
                    currentLimit: limit
                });
            }
        }

        if (products.length > 500) {
            return res.status(400).json({ error: "El límite por importación es de 500 productos." });
        }

        const batch = adminDb.batch();
        let created = 0;
        let updated = 0;
        let errors = 0;
        let bulkValueAdded = 0;
        let bulkCostAdded = 0;
        let bulkStockAdded = 0;
        let bulkProductCount = 0;
        const logs = [];

        for (const prod of products) {
            try {
                if (!prod.nombre) throw new Error("Producto sin nombre.");
                if (prod.nombre.length > 120) throw new Error("El nombre excede los 120 caracteres.");
                if (prod.valor === undefined || prod.valor === null) throw new Error("Producto sin valor.");

                let querySnapshot = { empty: true };

                // 1. Identificar si el producto ya existe mediante búsqueda robusta
                let existingDoc = null;
                const cleanNombreSearch = String(prod.nombre || '').toLowerCase().trim();
                const cleanSkuSearch = String(prod.sku || '').toLowerCase().trim();

                // Intentar por SKU (si existe)
                if (cleanSkuSearch !== "") {
                    querySnapshot = await adminDb.collection(COLLECTION)
                        .where('empresaId', '==', empresaId)
                        .where('sku_search', '==', cleanSkuSearch)
                        .limit(1)
                        .get();
                    if (!querySnapshot.empty) {
                        existingDoc = querySnapshot.docs[0];
                    } else {
                        // Si no se encontró por SKU, intentar por nombre por si acaso (para evitar duplicados por nombre)
                        querySnapshot = await adminDb.collection(COLLECTION)
                            .where('empresaId', '==', empresaId)
                            .where('nombre_search', '==', cleanNombreSearch)
                            .limit(1)
                            .get();
                        if (!querySnapshot.empty) existingDoc = querySnapshot.docs[0];
                    }
                } else {
                    // Si no hay SKU, buscar por nombre
                    querySnapshot = await adminDb.collection(COLLECTION)
                        .where('empresaId', '==', empresaId)
                        .where('nombre_search', '==', cleanNombreSearch)
                        .limit(1)
                        .get();
                    if (!querySnapshot.empty) existingDoc = querySnapshot.docs[0];
                }

                const rawEstado = prod.estado ? String(prod.estado).toLowerCase().trim() : 'activo';
                const newDate = safeGetDate(prod.fechaVencimiento);

                let productData = {
                    nombre: String(prod.nombre || '').trim(),
                    nombre_search: normalizeSearchTerm(prod.nombre || ''),
                    sku: String(prod.sku || '').trim(),
                    sku_search: normalizeSearchTerm(prod.sku || ''),
                    keywords: generateSearchKeywords(prod.nombre, prod.sku), // Indexación Nombre + SKU
                    descripcion: prod.descripcion || '',
                    valor: parseFloat(prod.valor) || 0,
                    costo: parseFloat(prod.costo) || 0,
                    estado: rawEstado === 'inactivo' ? 'inactivo' : 'activo',
                    ubicacion: prod.ubicacion || '',
                    atributos: prod.atributos || {},
                    empresaId: empresaId,
                    updatedAt: new Date()
                };

                // SOLO asignar la fecha si obtuvimos una válida del safeGetDate
                if (newDate) {
                    productData.fechaVencimiento = newDate;
                }

                if (!existingDoc) {
                    // --- CREACIÓN DE PRODUCTO NUEVO ---
                    if (limit !== Infinity && currentCount + created >= limit) {
                        throw new Error("Límite de productos de tu plan alcanzado durante la importación.");
                    }

                    productData.createdAt = new Date();
                    if (!productData.fechaVencimiento) productData.fechaVencimiento = null;
                    productData.stock = parseInt(prod.stock) || 0;
                    productData.totalValue = productData.stock * (productData.valor || 0);
                    productData.totalCostValue = productData.stock * (productData.costo || 0);

                    const newDocRef = adminDb.collection(COLLECTION).doc();
                    batch.set(newDocRef, productData);
                    created++;
                    bulkValueAdded += productData.totalValue;
                    bulkCostAdded += productData.totalCostValue;
                    bulkStockAdded += productData.stock;
                    bulkProductCount += 1;
                } else {
                    // --- ACTUALIZACIÓN DE PRODUCTO EXISTENTE ---
                    // Las actualizaciones NUNCA consumen espacio nuevo de plan, procedemos libremente
                    const docId = existingDoc.id;
                    const oldData = existingDoc.data();

                    // Sumar el stock en lugar de sobrescribirlo
                    productData.stock = (parseInt(oldData.stock) || 0) + (parseInt(prod.stock) || 0);

                    // Proteger la fecha: si el Excel trae null pero en DB hay fecha, la conservamos
                    if (!newDate && oldData.fechaVencimiento) {
                        // Conservar fecha antigua
                    } else if (newDate) {
                        productData.fechaVencimiento = newDate;
                    }

                    const docRef = adminDb.collection(COLLECTION).doc(docId);
                    batch.update(docRef, productData);
                    updated++;

                    const oldTotalValue = (parseInt(oldData.stock) || 0) * (parseFloat(oldData.valor) || 0);
                    const oldTotalCost = (parseInt(oldData.stock) || 0) * (parseFloat(oldData.costo) || 0);
                    const newTotalValue = productData.stock * productData.valor;
                    const newTotalCost = productData.stock * productData.costo;
                    bulkValueAdded += (newTotalValue - oldTotalValue);
                    bulkCostAdded += (newTotalCost - oldTotalCost);
                    bulkStockAdded += (parseInt(prod.stock) || 0);
                }
            } catch (err) {
                errors++;
                logs.push(`Error en SKU ${prod.sku || 'desconocido'}: ${err.message}`);
            }
        }

        applyEmpresaStatsDelta(batch, empresaId, {
            totalInventoryValue: bulkValueAdded,
            totalCostValue: bulkCostAdded,
            totalStock: bulkStockAdded,
            productCount: bulkProductCount
        });

        await batch.commit();

        await clearProductCaches(empresaId);

        res.status(200).json({
            message: "Importación procesada",
            resultados: { created, updated, errors },
            logs
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Obtiene productos con stock bajo (<= 5) de forma paginada.
 */
export const getLowStockProducts = async (req, res) => {
    try {
        const { empresaId, lastDocId, pageSize = 5 } = req.query;
        const limit = parseInt(pageSize);

        if (!empresaId) return res.status(400).json({ error: "empresaId es requerido" });

        // Intentar obtener del caché (solo para la primera página sin lastDocId)
        const cacheKey = `products-lowstock-${empresaId}-${pageSize}`;
        if (!lastDocId) {
            const cachedData = await statsCache.get(cacheKey);
            if (cachedData) return res.status(200).json(cachedData);
        }

        const empresaSnap = await adminDb.collection('empresas').doc(empresaId).get();
        const lowStockThreshold = empresaSnap.exists ? (empresaSnap.data().lowStockThreshold ?? 5) : 5;

        let query = adminDb.collection(COLLECTION)
            .where('empresaId', '==', empresaId)
            .where('estado', '==', 'activo')
            .where('stock', '<=', lowStockThreshold)
            .orderBy('stock', 'asc');

        if (lastDocId) {
            const lastDocSnap = await adminDb.collection(COLLECTION).doc(lastDocId).get();
            if (lastDocSnap.exists) query = query.startAfter(lastDocSnap);
        }

        const snapshot = await query.limit(limit + 1).get();
        const allDocs = snapshot.docs.map(doc => {
            const data = doc.data();
            if (data.fechaVencimiento && data.fechaVencimiento.toDate) data.fechaVencimiento = data.fechaVencimiento.toDate().toISOString();
            return { id: doc.id, ...data };
        });

        const products = allDocs.slice(0, limit);
        const hasMore = allDocs.length > limit;

        const responseData = {
            products,
            hasMore,
            lastDocId: products.length > 0 ? products[products.length - 1].id : null
        };

        if (!lastDocId) await statsCache.set(cacheKey, responseData);

        res.status(200).json(responseData);
    } catch (error) {
        console.error('Error fetching low stock:', error);
        const isIndexError = error.message.includes("index");
        res.status(isIndexError ? 412 : 500).json({ 
            error: isIndexError ? "Sincronización de inventario en curso" : "Error al obtener stock bajo", 
            isIndexError 
        });
    }
};

/**
 * Obtiene productos próximos a vencer de forma paginada.
 */
export const getExpiringProducts = async (req, res) => {
    try {
        const { empresaId, lastDocId, pageSize = 5, months = 2 } = req.query;
        const limit = parseInt(pageSize);
        const thresholdMonths = parseInt(months);

        if (!empresaId) return res.status(400).json({ error: "empresaId es requerido" });

        // Intentar obtener del caché (solo para la primera página)
        const cacheKey = `products-expiring-${empresaId}-${pageSize}-${months}`;
        if (!lastDocId) {
            const cachedData = await statsCache.get(cacheKey);
            if (cachedData) return res.status(200).json(cachedData);
        }

        const todayStartCaracas = getStartOfDayCaracas();
        const tomorrowStart = new Date(todayStartCaracas);
        tomorrowStart.setDate(tomorrowStart.getDate() + 1);

        const limitDate = new Date(todayStartCaracas);
        limitDate.setMonth(limitDate.getMonth() + thresholdMonths);
        limitDate.setHours(23, 59, 59, 999);

        let query = adminDb.collection(COLLECTION)
            .where('empresaId', '==', empresaId)
            .where('estado', '==', 'activo')
            .where('fechaVencimiento', '>=', tomorrowStart)
            .where('fechaVencimiento', '<=', limitDate)
            .orderBy('fechaVencimiento', 'asc');

        if (lastDocId) {
            const lastDocSnap = await adminDb.collection(COLLECTION).doc(lastDocId).get();
            if (lastDocSnap.exists) query = query.startAfter(lastDocSnap);
        }

        const baseFilter = adminDb.collection(COLLECTION)
            .where('empresaId', '==', empresaId)
            .where('estado', '==', 'activo')
            .where('fechaVencimiento', '>=', tomorrowStart)
            .where('fechaVencimiento', '<=', limitDate);

        // Primera página: lista + count agregado (barato) en paralelo
        const [snapshot, countSnap] = await Promise.all([
            query.limit(limit + 1).get(),
            !lastDocId ? baseFilter.count().get() : Promise.resolve(null)
        ]);

        const allDocs = snapshot.docs.map(doc => {
            const data = doc.data();
            if (data.fechaVencimiento && data.fechaVencimiento.toDate) data.fechaVencimiento = data.fechaVencimiento.toDate().toISOString();
            return { id: doc.id, ...data };
        });

        const products = allDocs.slice(0, limit);
        const hasMore = allDocs.length > limit;

        const responseData = {
            products,
            hasMore,
            lastDocId: products.length > 0 ? products[products.length - 1].id : null,
            ...(countSnap ? { totalCount: countSnap.data().count || 0 } : {})
        };

        if (!lastDocId) await statsCache.set(cacheKey, responseData);

        res.status(200).json(responseData);
    } catch (error) {
        console.error('Error fetching expiring:', error);
        const isIndexError = error.message.includes("index");
        res.status(isIndexError ? 412 : 500).json({ 
            error: isIndexError ? "Preparando datos de vencimiento" : "Error al obtener productos por vencer", 
            isIndexError 
        });
    }
};

/**
 * Obtiene productos ya vencidos de forma paginada.
 */
export const getExpiredProducts = async (req, res) => {
    try {
        const { empresaId, lastDocId, pageSize = 5 } = req.query;
        const limit = parseInt(pageSize);

        if (!empresaId) return res.status(400).json({ error: "empresaId es requerido" });

        // Intentar obtener del caché (solo para la primera página)
        const cacheKey = `products-expired-${empresaId}-${pageSize}`;
        if (!lastDocId) {
            const cachedData = await statsCache.get(cacheKey);
            if (cachedData) return res.status(200).json(cachedData);
        }

        const todayStartCaracas = getStartOfDayCaracas();

        let query = adminDb.collection(COLLECTION)
            .where('empresaId', '==', empresaId)
            .where('fechaVencimiento', '<=', todayStartCaracas)
            .orderBy('fechaVencimiento', 'desc');

        if (lastDocId) {
            const lastDocSnap = await adminDb.collection(COLLECTION).doc(lastDocId).get();
            if (lastDocSnap.exists) query = query.startAfter(lastDocSnap);
        }

        const snapshot = await query.limit(limit + 1).get();
        const allDocs = snapshot.docs.map(doc => {
            const data = doc.data();
            if (data.fechaVencimiento && data.fechaVencimiento.toDate) data.fechaVencimiento = data.fechaVencimiento.toDate().toISOString();
            return { id: doc.id, ...data };
        });

        const products = allDocs.slice(0, limit);
        const hasMore = allDocs.length > limit;

        const responseData = {
            products,
            hasMore,
            lastDocId: products.length > 0 ? products[products.length - 1].id : null
        };

        if (!lastDocId) await statsCache.set(cacheKey, responseData);

        res.status(200).json(responseData);
    } catch (error) {
        console.error('Error fetching expired:', error);
        const isIndexError = error.message.includes("index");
        res.status(isIndexError ? 412 : 500).json({ 
            error: isIndexError ? "Analizando productos vencidos" : "Error al obtener productos vencidos", 
            isIndexError 
        });
    }
};
