# Baify

Plataforma de gestión de inventario, ventas (POS), clientes y cuentas multi-empresa.

Monorepo con:

- **`frontend/`** — React + Vite + Material UI + Tailwind
- **`backend/`** — Express + Firebase Admin + Firestore (+ caché opcional con Upstash Redis)

## Características

- Multi-empresa con datos aislados por `empresaId`
- Autenticación (registro, login, recuperación de contraseña)
- Productos, stock e historial de movimientos
- Punto de venta (POS), ventas y métricas
- Clientes y cuentas por cobrar/pagar
- Panel admin y notificaciones
- Importación desde Excel y reportes PDF

## Requisitos

- Node.js 18+
- Proyecto Firebase con **Authentication** (Email/Password) y **Cloud Firestore**
- Clave de servicio de Firebase Admin (`serviceAccountKey.json`) — solo local / servidor, nunca en GitHub

## Configuración rápida

### 1. Clonar e instalar

```bash
git clone https://github.com/TU_USUARIO/baify.git
cd baify

cd backend && npm install && cd ..
cd frontend && npm install && cd ..
```

### 2. Secretos del backend

```bash
cp backend/.env.example backend/.env
```

Edita `backend/.env` con tus valores reales (ver sección **Variables de entorno**).

Descarga la clave de servicio desde:

**Firebase Console → Project settings → Service accounts → Generate new private key**

Guárdala como:

```text
backend/serviceAccountKey.json
```

Ese archivo **no se sube a Git** (está en `.gitignore`).

### 3. Frontend (opcional)

```bash
cp frontend/.env.example frontend/.env
```

Por defecto usa `http://localhost:3000/api`. Cámbialo si el API corre en otra URL.

### 4. Ejecutar en desarrollo

Terminal 1 — API:

```bash
cd backend
npm run dev
```

Terminal 2 — UI:

```bash
cd frontend
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend: `http://127.0.0.1:3000`

## Variables de entorno

### Backend (`backend/.env`)

| Variable | ¿Secreta? | Descripción |
|----------|-----------|-------------|
| `PORT` | No | Puerto del servidor (default `3000`) |
| `HOST` | No | Host de escucha (default `127.0.0.1`) |
| `FIREBASE_API_KEY` | Media* | Web API Key de Firebase (Auth REST) |
| `UPSTASH_REDIS_REST_URL` | Media | URL REST de Upstash (opcional) |
| `UPSTASH_REDIS_REST_TOKEN` | **Sí** | Token de Upstash — nunca publicar |
| `PABILO_API_KEY` | **Sí** | Clave de Pabilo para pagos (opcional) |
| `METER_FIRESTORE_READS` | No | `1` para medir lecturas en debug |

\*La Web API Key de Firebase suele considerarse “pública” en apps cliente, pero **no la hardcodees en el repo**; restríngela por dominio/IP en Firebase Console.

### Archivos que NUNCA van a GitHub

| Archivo / patrón | Riesgo |
|------------------|--------|
| `backend/.env` | Tokens reales (Upstash, Pabilo, etc.) |
| `backend/serviceAccountKey.json` | **Crítico** — control total de Firebase/Firestore |
| `frontend/.env` | URLs o keys de entorno |
| `node_modules/` | Dependencias (se reinstalan con `npm install`) |
| `frontend/dist/`, `dev-dist/` | Builds locales |

Usa siempre los `.env.example` como plantilla sin valores reales.

### Frontend (`frontend/.env`)

| Variable | Descripción |
|----------|-------------|
| `VITE_API_URL` | Base del API, ej. `http://localhost:3000/api` |

## Scripts útiles

**Backend**

```bash
npm start          # producción
npm run dev        # desarrollo con nodemon
npm run dev:clean  # libera el puerto y reinicia
npm test           # tests
```

**Frontend**

```bash
npm run dev      # desarrollo
npm run build    # build de producción
npm run preview  # previsualizar build
```

## Estructura

```text
Baify Project/
├── backend/                 # API Express
│   ├── config/              # Firebase Admin
│   ├── controllers/
│   ├── middleware/
│   ├── routes/
│   ├── utils/
│   ├── .env.example
│   └── server.js
├── frontend/                # App React (Vite)
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── store/
│   │   └── hooks/
│   └── .env.example
├── firestore.indexes.json
├── .gitignore
└── README.md
```

## Firestore

- Índicees: ver `firestore.indexes.json` en la raíz
- Reglas de ejemplo: `frontend/firestore.rules` (despliega en Firebase Console → Firestore → Rules)

## Seguridad al publicar en GitHub

1. Confirma que `.gitignore` ignora `.env` y `serviceAccountKey.json`
2. Antes del primer push: `git status` — **no** deben aparecer esos archivos
3. Si alguna vez se subió un secreto por error: **rótalo de inmediato** (Upstash, Pabilo, Firebase service account) y bórralo del historial de Git
4. En producción, configura las mismas variables en el hosting (Railway, Render, Vercel, etc.), no en el código

## Licencia

Uso privado / proyecto Baify.
