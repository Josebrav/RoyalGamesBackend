/**
 * Snapshot del avatar por defecto para cuentas MUJER (sexo === 'M'), equivalente al de
 * default-avatar.ts pero para el modelo femenino del Bazar. Igual que el masculino, es una
 * copia fija horneada en el código al momento de crear la cuenta — NO una referencia viva a
 * ninguna fila de usuario.
 *
 * Este archivo arranca como placeholder (DEFAULT_FEMALE_AVATAR_READY = false) porque todavía
 * no existe un avatar femenino guardado del cual sacar la imagen. El flujo para completarlo:
 *
 *   1. Cargar el arte de mujer en el AvatarManager de Unity (al menos el item 0 de Cabeza,
 *      Cuerpo, Pelo, Ojos, Boca, Nariz, Orejas, Cejas — los rasgos base).
 *   2. Correr el Bazar con una cuenta de prueba mujer, dejar que ApplyFemaleDefaults arme el
 *      look por defecto (o ajustarlo a mano) y tocar GUARDAR.
 *   3. Correr `node scripts/generate-female-default-avatar.js <userId>` con el id de esa
 *      cuenta: lee su avatar guardado de la base y reescribe este archivo con los datos
 *      reales y DEFAULT_FEMALE_AVATAR_READY = true.
 *
 * Mientras DEFAULT_FEMALE_AVATAR_READY sea false, users.service NO hornea nada para las
 * mujeres al registrarse (mismo comportamiento que había antes: se quedan sin avatar por
 * defecto hasta que exista el snapshot).
 */

export const DEFAULT_FEMALE_AVATAR_READY: boolean = false;

export const DEFAULT_FEMALE_AVATAR_MIME = 'image/png';

export const DEFAULT_FEMALE_AVATAR_BASE64 = '';

export const DEFAULT_FEMALE_AVATAR_BUFFER: Buffer | null = DEFAULT_FEMALE_AVATAR_BASE64
  ? Buffer.from(DEFAULT_FEMALE_AVATAR_BASE64, 'base64')
  : null;

export const DEFAULT_FEMALE_AVATAR_THUMB_BASE64 = '';

export const DEFAULT_FEMALE_AVATAR_THUMB_BUFFER: Buffer | null = DEFAULT_FEMALE_AVATAR_THUMB_BASE64
  ? Buffer.from(DEFAULT_FEMALE_AVATAR_THUMB_BASE64, 'base64')
  : null;

export const DEFAULT_FEMALE_AVATAR_DATA: Record<string, unknown> | null = null;
