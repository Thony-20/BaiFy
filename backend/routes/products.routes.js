import express from 'express';
import { 
    getProducts, 
    getAllProducts, 
    getProductById,
    getProductBySku,
    createProduct, 
    updateProduct, 
    deleteProduct,
    bulkUpsertProducts,
    getLowStockProducts,
    getExpiringProducts,
    getExpiredProducts
} from '../controllers/product.controller.js';
import { verifyToken } from '../middleware/auth.middleware.js';

const router = express.Router();

// Proteger todas las rutas de productos con el token JWT
router.use(verifyToken);

router.get('/', getProducts);
router.get('/all', getAllProducts);
router.post('/bulk-import', bulkUpsertProducts);

// Rutas especializadas para Dashboard
router.get('/low-stock', getLowStockProducts);
router.get('/expiring', getExpiringProducts);
router.get('/expired', getExpiredProducts);
router.get('/by-sku', getProductBySku);

router.get('/:id', getProductById);
router.post('/', createProduct);
router.put('/:id', updateProduct);
router.delete('/:id', deleteProduct);

export default router;
