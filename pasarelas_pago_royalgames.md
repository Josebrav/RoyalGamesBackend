# Plan de pasarelas de pago — RoyalGames

Estado: **documento de planeación**. Lo único que ya se tocó en código es lo de la sección 0 (retiro de dinero real y KYC) porque me lo pediste explícitamente; Pix y Paysafecard siguen como pendientes, sin integrar.

## 0. Cambio de modelo de negocio: sin retiro de dinero real, sin KYC

RoyalGames **no** permite cambiar fichas por dinero real — el usuario compra fichas y juega, nada más. Esto ya quedó reflejado en el código:

- Se quitó la relación `withdrawals` y el import de `Withdrawal` en `user.entity.ts`.
- `withdrawal.entity.ts` quedó vacío (documentado como deprecado) — no lo pude borrar directamente porque esta sesión no tiene acceso para borrar archivos en tu carpeta local; podés borrar el archivo y la carpeta `src/modules/withdrawals/` completa cuando quieras, ya no la referencia nada.
- Se agregó la migración `1789100000000-DropWithdrawalsTable.ts`, que elimina la tabla `withdrawals` de la base de datos — hace falta que la corras vos con `npm run typeorm:migration:run` cuando quieras aplicarla (no tengo acceso a tu base de datos desde aquí).
- En el frontend (`buyChips.jsx`) se quitó el formulario de retiro simulado (`handleWithdrawalSubmit` y sus estados) — de hecho ya era código muerto: no había ningún tab ni botón que lo mostrara, así que no cambia nada visible para el usuario.
- KYC no llegó a implementarse en código en ningún momento (solo estaba propuesto en `casino_functional_plan.md`) — ya no hace falta implementarlo. Actualicé ese documento marcando KYC y Withdrawals como **descartados**.

**Por qué esto cambia el resto del plan:** sin retiro, RoyalGames se parece mucho más a un juego social con compras dentro de la app (como Slotomania, Big Fish Casino, etc.) que a un casino de dinero real. Eso probablemente:

- **Reabre pasarelas "genéricas" que antes estaban descartadas.** Stripe prohíbe "casino games... with a monetary or material prize" — si las fichas no se pueden retirar ni canjear por dinero, es defendible que no hay "prize" monetario, y la venta de fichas pasa a ser venta de moneda virtual de un juego (que Stripe sí permite si eres el operador del mundo virtual, que es el caso). Vale la pena releer su política ahora con este modelo y, si aplican, confirmarlo directo con soporte de Stripe antes de asumirlo.
- **PayPal probablemente también deja de necesitar la aprobación especial para gambling** que mencioné antes — su política habla de actividades "con una cuota de entrada y un premio"; sin cashout no hay premio en dinero. De todas formas, dado que hoy la cuenta está en sandbox, este es buen momento para pasarla a producción confirmando esto con PayPal directamente.
- **Ojo con una cosa que NO cambia automáticamente:** el motor de riesgo de algunas pasarelas clasifica el negocio por palabras clave (casino, slots, ruleta, bingo) más que por si hay cashout o no — conviene declarar explícitamente en cualquier alta ("juego social, fichas sin valor de reembolso, sin retiro de dinero") para evitar un rechazo automático por el nombre de la marca.
- **La pregunta de licencia de juego (Coljuegos en Colombia, DGOJ en España) probablemente deja de aplicar**, porque esas licencias regulan juego con premio económico real. Aun así, esto es una zona gris legal (algunas normas miran si hay "dinero apostado con riesgo de pérdida", no solo si hay cashout) — no soy abogado, así que antes de descartarlo del todo yo lo confirmaría con una consulta legal puntual en cada país donde vayan a cobrar, en vez de asumirlo.

## 1. Diagnóstico rápido del proyecto (actualizado)

**Backend** (`RoyalBack`, NestJS + TypeORM + PostgreSQL): módulo `payments` con MercadoPago (cuentas vendedoras separadas por país — AR, CO, MX — cada una liquidando en su moneda real) y PayPal (hoy en `SandboxEnvironment`, cobra siempre en **USD**). Ya no hay módulo de retiros (ver sección 0).

**Frontend** (`RoyalFrontNew`, `buyChips.jsx`): contempla Argentina, Brasil, Colombia, México, España, Estados Unidos y "resto del mundo", pero solo ARS/COP/MXN enrutan a MercadoPago — Brasil (BRL) y España (EUR) caen a PayPal en USD.

## 2. Fixes pendientes, en orden de prioridad

1. **[Alta] La entidad `Pay` no guarda la moneda del pago.** No hay columna `currency` — y esto ya afecta a los pagos de HOY (MercadoPago/PayPal), no solo a los que vendrían con Pix/Paysafecard: hoy no queda registrado si un pago fue en ARS, COP, MXN o USD, solo el monto. Es el fix con más impacto inmediato y el más barato de hacer — lo pondría primero.
2. **[Alta] El frontend no sabe elegir pasarela para BRL ni EUR.** El `useEffect` que decide `paymentMethod` automáticamente solo reconoce MXN/ARS/COP. Sin esto, aunque el backend llegue a soportar Pix o Paysafecard, un usuario de Brasil o España nunca cae ahí por defecto — bloquea directamente el objetivo de "priorizar Pix" que mencionaste.
3. **[Media] Confirmar con PayPal y (si aplica) con Stripe la clasificación del negocio ahora que no hay retiro.** No es código, pero condiciona si PayPal puede pasar a producción tranquilo y si Stripe entra de nuevo como opción válida — mejor resolverlo antes de invertir tiempo de desarrollo en cualquiera de las dos.
4. **[Media] `paymentPlatform` es texto libre, no un enum** (`'mepago'`, `'paypal'`). Con más plataformas nuevas (Pix, Paysafecard) esto empieza a generar inconsistencias en reportes y en el panel de admin — conviene pasarlo a enum antes de sumar la primera plataforma nueva, pero no bloquea nada mientras tanto.
5. **[Baja, transversal] ¿RoyalGames ya es una empresa constituida (NIT/sociedad), o hoy opera como persona natural?** Tanto EBANX/dLocal (Pix) como Paysafecard piden documentos de la empresa (KYB) — sigue siendo un requisito aunque ya no haya KYC de usuarios ni licencia de juego de por medio, porque el PSP necesita saber con quién está contratando, independientemente del modelo de negocio.

## 3. Pasarelas a implementar (pendientes — todavía no se decide ni se integra nada)

### 3.1 Pix (Brasil)

**El punto que no cambia con el nuevo modelo de negocio:** Pix es un sistema del Banco Central de Brasil pensado para personas y empresas *registradas en Brasil* — generar una llave Pix para recibir dinero exige un **CPF o CNPJ brasileño** ligado a una cuenta en una institución financiera brasileña, sin importar si el negocio es gambling o un juego social. Eso significa que la idea original ("agregar Brasil al mismo patrón de cuentas vendedoras de MercadoPago que ya tienen para AR/CO/MX") **no es viable siendo de Colombia**: Mercado Pago Brasil, como cualquier PSP brasileño, pide ese CPF/CNPJ para abrir la cuenta vendedora — no hay una versión "internacional" de esa cuenta.

Hay dos caminos reales para resolverlo:

**Camino A — el recomendado: un agregador cross-border que ya es el sujeto regulado en Brasil** (EBANX o dLocal). Ellos tienen la licencia y la infraestructura Pix; ustedes firman como comercio extranjero y ellos les liquidan en USD (o la moneda que negocien), sin que RoyalGames necesite una empresa brasileña. Pasos:

1. Tener una entidad legal (aunque sea colombiana) — piden razón social, NIT, representante legal; no aceptan persona natural sin registro.
2. Entrar al formulario de alta comercial: [EBANX — Merchant Signup](https://www.ebanx.com/en/contact/) o el equivalente de dLocal ([dlocal.com](https://www.dlocal.com/)) y describir el negocio como lo que es ahora: juego social con compra de fichas virtuales sin retiro de dinero real — declararlo bien desde el primer contacto evita un rechazo o revisión más larga por confusión de categoría.
3. Proceso de compliance (KYB): suben documentos de la empresa, accionistas/beneficiario final, el sitio web, y cómo se mueve el dinero (depósito → fichas → juego, sin salida).
4. Firma de contrato comercial y tabla de tarifas — ahí se define en qué moneda liquidan (normalmente ellos cobran en BRL vía Pix y les pagan a ustedes en USD; hay que revisar el spread cambiario, no solo la comisión).
5. Les dan credenciales de sandbox de su API (EBANX Direct API o la API de dLocal).
6. Recién ahí entra la parte de código: un repository nuevo en `payments` (mismo patrón que `mercadopago.repository.ts`), el webhook de confirmación de Pix, y en el frontend mapear BRL a ese proveedor en vez de (o adicional a) MercadoPago — esto depende de que primero esté resuelto el fix #2 de la sección 2.
7. Pruebas en sandbox → producción.

**Camino B — constituir una empresa en Brasil (CNPJ)** para abrir una cuenta vendedora nativa de Mercado Pago Brasil (el mismo patrón exacto que ya usan para AR/CO/MX). Es la opción más "integrada" con lo que ya existe en el código, pero implica incorporar una sociedad en Brasil (representante legal, contador local, trámites ante la Receita Federal) — mucho más lento y costoso que el Camino A, y solo se justifica si Brasil termina siendo una porción grande y sostenida del volumen. No es lo que recomendaría para empezar.

**Recomendación:** arrancar por el Camino A (EBANX o dLocal) — es la ruta que de verdad está pensada para alguien fuera de Brasil, y no bloquea nada del resto del roadmap.

### 3.2 Paysafecard (España / Europa)

Paysafecard acepta iGaming explícitamente como vertical, y como método de pago siempre fue de "solo carga" (nunca paga retiros, es un vale prepago) — así que el cambio de modelo de negocio no le afecta técnicamente en nada. Lo que sí cambia es el punto de licencia:

1. **Licencia de juego para España — ahora es una zona gris, no un bloqueo automático.** España exige licencia de la **DGOJ** para juego de dinero real con premio económico. Sin retiro ni posibilidad de convertir fichas en dinero, hay un argumento razonable de que esto cae fuera de ese régimen (como los juegos sociales de casino que operan en España sin licencia DGOJ) — pero la ley española también mira si hay "dinero apostado con riesgo de pérdida", así que no lo daría por descontado sin una consulta legal puntual antes de lanzarse a integrar.
2. **Entidad legal + KYB.** Sigue aplicando igual que antes: piden "detalles de la empresa, su propiedad y poder de representación", documentos que se suben a su "Service Center".
3. **Alta:** formulario online en el sitio de negocio de Paysafecard → acceso automático al Service Center para completar KYB y, tras aprobación, empezar la integración técnica.
4. **Tarifas a tener en cuenta:** van del 15% (bajo volumen) al 9.5% (para más de €350.000 mensuales) — es una comisión alta comparada con tarjetas o MercadoPago, hay que factorizarla en el precio que ve el usuario final en España.
5. **Alternativa a negociar directo con Paysafecard:** varios agregadores de pagos para iGaming ya incluyen Paysafecard dentro de un solo contrato (junto con Skrill, Neteller, tarjetas, etc.), lo cual puede ser más simple que dar de alta una cuenta propia si el volumen en España empieza bajo — vale la pena cotizar esa vía en paralelo antes de decidir.
6. **Integración técnica** (cuando ya esté aprobada la cuenta): flujo de voucher/PIN de 16 dígitos + webhook de confirmación de pago, siguiendo el mismo patrón de repository que ya existe para MercadoPago/PayPal.

## 4. Cómo queda el orden de trabajo

1. Resolver los fixes #1 y #2 de la sección 2 (moneda en `Pay`, y que el frontend sepa enrutar BRL/EUR) — son los dos que más impacto tienen y no dependen de decisiones externas.
2. Confirmar con PayPal (y evaluar Stripe) la clasificación del negocio sin retiro — fix #3.
3. En paralelo, resolver el tema de la empresa/entidad legal — es el requisito común para avanzar con Pix o Paysafecard (fix #5), y hacer el enum de `paymentPlatform` cuando haya tiempo (fix #4).
4. Decidir Pix: cotizar EBANX vs. dLocal, aplicar, pasar KYB.
5. Decidir Paysafecard: confirmar la situación legal en España con una consulta puntual, cotizar directo vs. vía agregador, aplicar.
6. Solo cuando alguna de las dos tenga cuenta aprobada y credenciales de sandbox, entramos a escribir el código de integración.
