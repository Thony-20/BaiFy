# StockPro - Gestión de Inventario Multi-Empresa

Aplicación de gestión de stock para múltiples empresas, construida con React + Firebase.

## 🚀 Características

- **Multi-empresa**: Cada empresa tiene sus datos completamente aislados
- **Autenticación**: Registro y login con Firebase Auth
- **CRUD de productos**: Crear, editar, eliminar y listar productos
- **Atributos dinámicos**: Agrega campos personalizados a tus productos (color, talla, marca, etc.)
- **Gestión de stock**: Incrementar/reducir stock con transacciones atómicas
- **Historial**: Registro completo de movimientos de stock
- **Dashboard**: Métricas en tiempo real (total productos, stock bajo, movimientos recientes)
- **Roles**: Admin (gestión completa) vs Empleado (solo visualización y stock)
- **Seguridad**: Reglas de Firestore que previenen acceso cruzado entre empresas
- **Responsive**: Diseño adaptable a cualquier dispositivo

## 📋 Requisitos Previos

1. **Node.js** v18 o superior
2. Un **proyecto de Firebase** con:
   - Authentication habilitado (proveedor Email/Password)
   - Cloud Firestore habilitado

## ⚙️ Configuración

### 1. Clonar e instalar dependencias

```bash
cd gestion-stocks
npm install
```

### 2. Configurar Firebase

Edita el archivo `src/firebase.js` y reemplaza los valores de configuración con los de tu proyecto Firebase:

```javascript
const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "TU_PROJECT.firebaseapp.com",
  projectId: "TU_PROJECT_ID",
  storageBucket: "TU_PROJECT.appspot.com",
  messagingSenderId: "TU_SENDER_ID",
  appId: "TU_APP_ID"
};
```

Puedes encontrar estos valores en:
**Firebase Console → Project Settings → General → Your apps → SDK setup and configuration**

### 3. Desplegar reglas de seguridad de Firestore

Copia el contenido de `firestore.rules` y pégalo en:
**Firebase Console → Firestore Database → Rules**

### 4. Crear índices en Firestore

La app necesita índices compuestos. Firestore los creará automáticamente cuando ejecutes las primeras queries y verás un link en la consola del navegador para crearlos.

**Índices requeridos:**
- `productos`: `empresaId` (ASC) + `createdAt` (DESC)
- `productos`: `empresaId` (ASC) + `estado` (ASC) + `createdAt` (DESC)
- `movimientos_stock`: `productoId` (ASC) + `empresaId` (ASC) + `fecha` (DESC)
- `movimientos_stock`: `empresaId` (ASC) + `fecha` (DESC)

### 5. Ejecutar en desarrollo

```bash
npm run dev
```

La app estará disponible en `http://localhost:5173`

## 🏗️ Estructura del Proyecto

```
src/
├── main.jsx                    # Entry point
├── App.jsx                     # Router y providers
├── index.css                   # Estilos globales
├── theme.js                    # Tema MUI personalizado
├── firebase.js                 # Configuración Firebase
├── store/
│   └── useAuthStore.js         # Estado global (Zustand)
├── services/
│   ├── authService.js          # Auth (registro, login, perfil)
│   ├── productService.js       # CRUD productos
│   └── stockService.js         # Ajustes de stock (transacciones)
├── hooks/
│   ├── useAuth.js              # Hook de autenticación
│   └── useProducts.js          # Hook de productos
├── components/
│   ├── ProtectedRoute.jsx      # Guard de rutas
│   ├── Layout.jsx              # Shell de la app
│   ├── ProductFormModal.jsx    # Modal crear/editar producto
│   ├── ProductTable.jsx        # Tabla de productos
│   ├── StockAdjustDialog.jsx   # Diálogo ajuste de stock
│   └── MovimientosDialog.jsx   # Historial de movimientos
├── pages/
│   ├── LoginPage.jsx           # Página de login
│   ├── RegisterPage.jsx        # Página de registro
│   ├── DashboardPage.jsx       # Dashboard con métricas
│   └── ProductosPage.jsx       # Gestión de productos
└── utils/
    └── constants.js            # Constantes de la app
```

## 🔒 Seguridad Multi-Empresa

- Cada usuario tiene un `empresaId` en su perfil
- **Todas las queries** filtran por `empresaId`
- Las **reglas de Firestore** validan que:
  - Solo usuarios autenticados pueden acceder
  - Solo pueden leer/escribir documentos de su propia empresa
  - El `empresaId` no puede ser modificado
  - El stock nunca puede ser negativo
  - Los movimientos de stock son inmutables

## 🛠️ Tecnologías

- **React** + Vite
- **Material UI (MUI)**
- **Firebase** (Auth + Firestore)
- **Zustand** (estado global)
- **React Router** (navegación)
- **react-hot-toast** (notificaciones)
