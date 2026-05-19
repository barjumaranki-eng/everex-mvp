# Despliegue: Supabase PostgreSQL + Vercel

Proyecto Supabase: `https://cheiwzsgxtssyorsotit.supabase.co`

## Variables en `.env` (local) y Vercel

| Variable | Uso |
|----------|-----|
| `DATABASE_URL` | Pooler Supabase (puerto **6543**, `?pgbouncer=true`) — Next.js en runtime |
| `DIRECT_URL` | Conexión directa (puerto **5432**) — `prisma migrate deploy` |
| `SQLITE_DATABASE_URL` | Solo migración de datos desde `prisma/dev.db` |

Copia las URLs en Supabase → **Project Settings → Database**:

- **DATABASE_URL**: *Connection string* → **URI** → modo **Transaction** (pooler).
- **DIRECT_URL**: *Direct connection* → **URI**.

---

## Paso a paso (orden obligatorio)

### 0. Backup SQLite (no destructivo)

```powershell
cd c:\Users\dalju\everex-mvp
Copy-Item prisma\dev.db prisma\dev.db.backup -ErrorAction SilentlyContinue
```

### 1. Instalar dependencias

```powershell
npm install
```

### 2. Configurar `.env`

Edita `.env` y sustituye:

```env
DATABASE_URL="postgresql://postgres.cheiwzsgxtssyorsotit:[PASSWORD]@....pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres:[PASSWORD]@db.cheiwzsgxtssyorsotit.supabase.co:5432/postgres"
SQLITE_DATABASE_URL="file:./prisma/dev.db"
```

### 3. Generar cliente Prisma (PostgreSQL)

```powershell
npx prisma generate
```

### 4. Crear tablas en Supabase (migración inicial Postgres)

```powershell
npx prisma migrate deploy
```

Debe aplicar `prisma/migrations/20260518190000_postgres_init/`.

### 5. Copiar datos SQLite → Supabase

```powershell
npm run db:migrate:sqlite-to-pg
```

### 6. Verificar datos

```powershell
node scripts/verify-postgres.mjs
```

Comprueba usuarios (`alyson@`, `fernanda@`), conteos de operaciones, compras, bancos, gastos.

### 7. Probar app local contra Supabase

```powershell
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm run dev
```

Login: `alyson@everex.local` / `everex123` (o usuarios del seed si re-ejecutaste seed).

### 8. Build de producción local

```powershell
npm run build
```

---

## Vercel

### Variables de entorno (Production)

En **Vercel → Project → Settings → Environment Variables**:

| Name | Value |
|------|--------|
| `DATABASE_URL` | URI pooler Supabase (6543) |
| `DIRECT_URL` | URI directa (5432) |
| `NODE_ENV` | `production` (Vercel suele fijarlo solo) |

No subas `.env` a Git.

### Conectar repositorio

```powershell
git add .
git commit -m "PostgreSQL (Supabase) + Vercel build"
git push origin main
```

En Vercel: **Import Project** → repo → Framework **Next.js** (detecta `vercel.json`).

`vercel.json` ejecuta:

```text
prisma generate && prisma migrate deploy && next build
```

### Tras el primer deploy

1. Abre `https://TU-DOMINIO.vercel.app/login`
2. Inicia sesión con usuario migrado
3. Revisa dashboard, operadores, bancos, gastos

### Seed opcional (solo si la BD está vacía y no migraste SQLite)

```powershell
npx tsx prisma/seed.ts
```

---

## Desarrollo local solo con Supabase (sin SQLite)

Usa el mismo `.env` con `DATABASE_URL` + `DIRECT_URL`. No hace falta `prisma/dev.db`.

Para volver a SQLite temporalmente tendrías que restaurar `prisma/migrations_sqlite_legacy` y cambiar `provider` en `schema.prisma` (no recomendado).

---

## Migraciones futuras

```powershell
npx prisma migrate dev --name descripcion_cambio
git add prisma/migrations
git push
```

Vercel aplicará `migrate deploy` en cada build.

---

## Rollback

- App: redeploy commit anterior en Vercel.
- Datos: restaurar backup Supabase (Dashboard → Backups) o `prisma/dev.db.backup` + repetir paso 5 contra BD vacía.
