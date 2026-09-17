# 🎰 Plan Funcional y de Entidades - Casino Online RoyalGames

Este documento detalla el plan funcional y el diseño de entidades sugerido para transformar **RoyalGames** en una plataforma de casino online profesional, segura, escalable y atractiva. 

> **Decisión de producto:** RoyalGames **no** permite retirar dinero real ni cambiar fichas por dinero — el usuario solo compra fichas y juega. Por eso este documento ya no contempla KYC ni Withdrawals; las secciones que las proponían quedan marcadas como **descartadas** más abajo, y el código correspondiente (entidad `Withdrawal`, relación en `User`, tabla `withdrawals`) fue removido.

---

## 👥 1. Roles y Funciones del Sistema

### 👤 1.1. Funciones del Usuario (Jugador)
El jugador es el centro de la aplicación. Para ofrecer una experiencia premium y fluida, debe contar con las siguientes capacidades:

#### **A. Gestión de Cuenta y Seguridad**
*   **Registro e Inicio de Sesión Seguro:** Registro con validación de correo electrónico, soporte de JWT y posibilidad de implementar **MFA (Autenticación de Dos Factores)** vía Google Authenticator o correo.
*   **Gestión de Perfil:** Modificación de datos personales (nick, avatar, contraseña, país de origen, descripción) y verificación de mayoría de edad.
*   ~~**Verificación KYC (Know Your Customer)**~~ — **DESCARTADO.** No aplica: no hay retiros que habilitar ni obligación de AML, porque las fichas nunca se cambian por dinero real.

#### **B. Monedero y Transacciones**
*   **Depósito de Fichas (Compra):** Integración directa con pasarelas de pago automatizadas como **MercadoPago** (para monedas locales) y **PayPal** (internacional), con actualización instantánea de saldo tras la verificación del webhook.
*   **Historial Transaccional:** Registro detallado de compras y depósitos en tiempo real.
*   ~~**Solicitud de Retiro (Withdrawals)**~~ — **DESCARTADO.** El usuario compra fichas para jugar; no puede cambiarlas de vuelta por dinero real.

#### **C. Experiencia de Juego**
*   **Catálogo de Juegos Interactivo:** Navegación por categorías de juegos (Mina, Lotería, Ruleta, Pachinka, Bingo, etc.).
*   **Favoritos:** Sistema para agregar/quitar juegos de su lista de favoritos (guardado en base de datos para persistencia entre dispositivos).
*   **Apuestas en Tiempo Real:** Realizar apuestas en fichas dentro de los juegos, con cálculo inmediato de resultados y actualización del saldo mediante transacciones de base de datos seguras.
*   **Provably Fair Checker (Juego Probablemente Justo):** Herramienta integrada dentro de cada juego para que el usuario pueda verificar mediante hashes criptográficos (`server_seed`, `client_seed`, `nonce`) que la ronda fue 100% aleatoria y no manipulada.

#### **D. Juego Responsable**
*   **Límites de Depósito:** Configuración de topes diarios, semanales o mensuales de recarga.
*   **Autoexclusión:** Posibilidad de bloquear temporalmente la cuenta (por 24 horas, 7 días, 30 días o de forma permanente) sin posibilidad de revertir la acción hasta que expire el plazo.
*   **Historial de Apuestas:** Visualización clara de cuánto ha apostado, cuánto ha ganado y cuál es su saldo neto.

---

### 👑 1.2. Funciones de Administrador (Panel de Control)
Los administradores necesitan herramientas completas para gestionar el riesgo, supervisar las finanzas y dar soporte.

#### **A. Gestión de Usuarios y Moderación**
*   **Búsqueda y Filtros Avanzados:** Buscar jugadores por email, nick, ID, saldo, país o estado (activo/baneado).
*   **Control de Cuentas (Moderación):** Banear/Desbanear usuarios, marcar cuentas inactivas, ver el historial de inicio de sesión e IPs utilizadas (detección de cuentas duplicadas).
*   **Gestión de Saldo Manual:** Capacidad de añadir o quitar fichas a un usuario específico (por ejemplo, para resolver reclamos o asignar premios especiales), registrando un log de auditoría obligatorio de quién realizó la acción.
*   ~~**Aprobación de KYC**~~ — **DESCARTADO** (no hay retiros que verificar).

#### **B. Control Financiero y Auditoría**
*   ~~**Aprobación de Retiros**~~ — **DESCARTADO.** No existe un flujo de pago hacia el jugador; el dinero solo entra (compra de fichas).
*   **Métricas Financieras en Tiempo Real (Dashboard):**
    *   **Ingresos por venta de fichas:** Total cobrado a través de las pasarelas de pago.
    *   **Costos:** Bonos/fichas regaladas + comisiones de pasarelas.
    *   **Volumen de depósitos:** Gráficos de ingresos semanales/mensuales.

#### **C. Gestión y Ajustes de Juegos**
*   **Administración del Catálogo:** Crear, editar y desactivar juegos (poner en mantenimiento).
*   **Configuración del Retorno al Jugador (RTP / Margen de la Casa):** Ajustar la probabilidad base y multiplicadores máximos de juegos desarrollados in-house (ej. Minas, Ruleta) para mantener el balance matemático del casino.

#### **D. Soporte y Promociones**
*   **Soporte Técnico Integrado:** Visualizar y responder tickets de soporte de los usuarios.
*   **Gestión de Bonos y Códigos Promocionales:** Crear cupones de fichas gratis (ej. `WELCOME2026`) con límites de uso por usuario y fecha de expiración.

---

## 🗄️ 2. Entidades del Sistema (Base de Datos)

Para soportar las funciones profesionales descritas, se propone extender el modelo relacional actual. A continuación se detallan las entidades clave, sus campos recomendados y relaciones:

### 👤 2.1. Entidad: `User` (Usuarios)
Representa a los jugadores y administradores.
*   `id` (UUID, PK)
*   `nick` (VARCHAR, Unique, Max 30)
*   `email` (VARCHAR, Unique, Max 50)
*   `password` (VARCHAR) - *Encriptado con bcrypt*
*   `avatar` / `image` (VARCHAR, Nullable) - *Almacenado en Cloudinary*
*   `age` (INT)
*   `sexo` (VARCHAR)
*   `country` (VARCHAR, Nullable)
*   `chips` (BIGINT, Default 0) - *Saldo del usuario*
*   `role` (ENUM: 'USER', 'ADMIN', 'MODERATOR')
*   `banned` (BOOLEAN, Default false)
*   `inactive` (BOOLEAN, Default false)
*   `twoFactorSecret` (VARCHAR, Nullable) - *Para MFA*
*   `selfExclusionUntil` (TIMESTAMP, Nullable) - *Fecha hasta la que el usuario está autoexcluido*
*   `createdAt` (TIMESTAMP)

### 💳 2.2. Entidad: `Pay` (Pagos/Depósitos)
Registra las compras de fichas aprobadas o pendientes.
*   `id` (UUID, PK)
*   `paymentPlatform` (ENUM: 'MERCADOPAGO', 'PAYPAY', 'STRIPE')
*   `paymentGatewayId` (VARCHAR, Nullable) - *ID devuelto por MercadoPago o PayPal*
*   `price` (DECIMAL(10,2)) - *Monto de dinero real pagado*
*   `currency` (VARCHAR, e.g., 'USD', 'MXN', 'ARS')
*   `chips` (BIGINT) - *Cantidad de fichas acreditadas*
*   `status` (ENUM: 'PENDING', 'APPROVED', 'FAILED', 'CANCELLED')
*   `userId` (UUID, FK -> User.id)
*   `createdAt` (TIMESTAMP)

### 💸 2.3. ~~Entidad: `Withdrawal` (Solicitudes de Retiro)~~ — DESCARTADA

Esta entidad y su tabla (`withdrawals`) fueron removidas del código: RoyalGames no ofrece retiro de dinero real, así que no hay ganancias que pagar de vuelta al jugador.

### 🎰 2.4. Entidad: `Game` (Juegos)
*   `id` (UUID, PK)
*   `name` (VARCHAR, Unique)
*   `slug` (VARCHAR, Unique) - *Para las rutas del frontend*
*   `category` (ENUM: 'SLOTS', 'CRASH', 'MINES', 'ROULETTE', 'LOTTERY')
*   `imageUrl` (VARCHAR)
*   `isActive` (BOOLEAN, Default true)
*   `rtp` (DECIMAL(4,2), Default 95.00) - *Porcentaje de retorno al jugador configurado*
*   `minBet` (BIGINT, Default 1)
*   `maxBet` (BIGINT, Default 10000)
*   `createdAt` (TIMESTAMP)

### 🎲 2.5. Entidad: `Bet` / `GameRound` (Apuestas/Rondas) [NUEVA]
Almacena el historial y resultado de cada jugada. Vital para auditorías y estadísticas.
*   `id` (UUID, PK)
*   `userId` (UUID, FK -> User.id)
*   `gameId` (UUID, FK -> Game.id)
*   `betAmount` (BIGINT) - *Monto apostado en fichas*
*   `payoutAmount` (BIGINT) - *Monto ganado en fichas (0 si perdió)*
*   `multiplier` (DECIMAL(6,2)) - *Multiplicador de la jugada (ej. 1.50x, 0.00x)*
*   `gameData` (JSON) - *Detalle de la jugada (ej. posición de las minas, cartas obtenidas, etc.)*
*   `serverSeed` (VARCHAR) - *Semilla del servidor usada*
*   `clientSeed` (VARCHAR) - *Semilla del cliente configurada*
*   `nonce` (INT) - *Número de jugada única del usuario para esa semilla*
*   `createdAt` (TIMESTAMP)

### 🏷️ 2.6. Entidad: `PromoCode` (Códigos Promocionales) [NUEVA]
*   `id` (UUID, PK)
*   `code` (VARCHAR, Unique, uppercase) - *Ej: ROYALFREE50*
*   `chipsAmount` (BIGINT) - *Fichas que regala*
*   `maxUses` (INT) - *Máximo de usos globales (ej. primeros 100 usuarios)*
*   `currentUses` (INT, Default 0)
*   `expiresAt` (TIMESTAMP)
*   `isActive` (BOOLEAN, Default true)
*   `createdAt` (TIMESTAMP)

---

## 🚀 3. Sugerencias clave para una Aplicación Profesional (Casino Premium)

### 🔒 3.1. Arquitectura y Transaccionalidad
1.  **Transacciones ACID para las Apuestas:** 
    *   Al realizar una apuesta, la deducción de fichas y la asignación del premio deben ocurrir dentro de una **transacción de base de datos** (`COMMIT`/`ROLLBACK`). Esto previene duplicaciones de saldo si la conexión falla a mitad del juego.
2.  **Verificación de Webhooks en Pagos:**
    *   Implementar validación de firmas criptográficas en los endpoints de webhook de MercadoPago y PayPal. Esto evita que atacantes simulen solicitudes HTTP de pago aprobado para obtener fichas infinitas.

### ⚖️ 3.2. Juego Provamente Justo (Provably Fair)
Los casinos modernos no operan como "cajas negras". Para ganar la confianza del jugador:
*   **Fórmula:** Usar algoritmos transparentes. Al iniciar la ronda, se genera un hash SHA-256 de una semilla aleatoria del servidor (`server_seed`). Se le muestra al usuario el hash de esta semilla *antes* de que juegue.
*   El usuario puede proporcionar su propia semilla (`client_seed`).
*   Al combinarlas con un `nonce` (un contador incremental), se genera el resultado matemático.
*   Al terminar el juego, el servidor revela el `server_seed` original, permitiendo al usuario ingresar las variables en un script verificado para confirmar que el resultado fue exactamente el predeterminado y no cambió según su apuesta.

### 🛡️ 3.3. Seguridad y Prevención de Fraude
1.  **Protección de Endpoints:**
    *   **Rate Limiting (Limitador de frecuencia):** Proteger endpoints como `/auth/login`, `/register` y `/chips/add` usando `nestjs-throttler` para evitar ataques DDoS y de fuerza bruta.
2.  **Registro de IPs y User-Agents:**
    *   Registrar la IP en cada inicio de sesión. Si múltiples cuentas acceden desde la misma IP y realizan transacciones sospechosas, alertar automáticamente en el panel de administrador para prevenir el *multi-accounting* (abuso de bonos).

### 🎨 3.4. Experiencia del Usuario (UX/UI Premium)
1.  **Efectos de Sonido y Animaciones:**
    *   Integrar efectos de sonido sutiles de victoria, giro y pérdida (con opción de mutear).
    *   Uso de micro-animaciones en las transiciones de fichas (por ejemplo, ver cómo se incrementan las fichas en el header con un contador animado).
2.  **Notificaciones Real-Time (WebSockets):**
    *   Usar NestJS Gateways (Socket.io) para notificar inmediatamente en el frontend si un depósito fue aprobado por MercadoPago, o si un administrador le ha enviado un mensaje/alerta.
    *   Mostrar un feed interactivo de "Últimas Ganancias de Jugadores" para fomentar la competitividad y dar sensación de comunidad activa.
