require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Genera src/common/constants/default-avatar.ts a partir del avatar ya guardado por una
// cuenta de prueba HOMBRE (misma idea que generate-female-default-avatar.js, pero para el
// default que se asigna a toda cuenta nueva en users.service.ts / auth.service.ts /
// bingo-bot.service.ts).
//
// Uso:  node scripts/generate-default-avatar.js <userId>
//
// Pasos previos: en el Bazar (Unity), entrar con una cuenta de prueba SIN avatar guardado
// (para que se vea el look de fábrica armado por AvatarManager.ApplyMaleDefaults — cabeza,
// pelo, ojos, boca, nariz, orejas, cejas y REMERA, todos en el item 0, sin accesorios) y
// tocar GUARDAR. Eso sube avatar_bin / avatar_thumb_bin / avatarData para esa cuenta.
//
// El default anterior (el que reemplaza este script) tenía shirtIndex/hairIndex/mouthIndex/
// earsIndex/eyebrowsIndex en -1 — sin remera, entre otras cosas — así que el cuerpo base
// (cortado a la altura del pecho, sin mangas) quedaba como única capa visible. Por eso toda
// cuenta nueva se veía "cortada" hasta el primer guardado propio del jugador.

const userId = process.argv[2];

if (!userId) {
  console.error('Falta el userId.  Uso: node scripts/generate-default-avatar.js <userId>');
  process.exit(1);
}

const OUT_PATH = path.join(__dirname, '..', 'src', 'common', 'constants', 'default-avatar.ts');

function fileContents({ avatarBase64, thumbBase64, avatarData, sourceNick, sourceUserId }) {
  const dataJson = JSON.stringify(avatarData, null, 2);
  return `/**
 * Snapshot of a fixed default avatar (image + Vestidor layer composition), baked into the
 * code at account-creation time. Intentionally NOT a live reference to any user's row —
 * if that user later changes their own avatar, new accounts already assigned this default
 * are unaffected, and future signups keep getting this exact snapshot.
 *
 * Regenerado por scripts/generate-default-avatar.js a partir del avatar guardado por la
 * cuenta de prueba ${sourceNick} (${sourceUserId}). Para volver a generarlo: guardar de
 * nuevo ese avatar en el Bazar y correr el script otra vez con el mismo id.
 */
export const DEFAULT_AVATAR_MIME = 'image/png';

export const DEFAULT_AVATAR_BASE64 =
  '${avatarBase64}';

export const DEFAULT_AVATAR_BUFFER = Buffer.from(DEFAULT_AVATAR_BASE64, 'base64');

export const DEFAULT_AVATAR_THUMB_BASE64 =
  '${thumbBase64}';

export const DEFAULT_AVATAR_THUMB_BUFFER = Buffer.from(DEFAULT_AVATAR_THUMB_BASE64, 'base64');

export const DEFAULT_AVATAR_DATA = ${dataJson};
`;
}

async function main() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, nick, sexo, "avatarData", avatar_bin, avatar_thumb_bin
       FROM "users" WHERE id = $1`,
      [userId],
    );

    if (rows.length === 0) {
      throw new Error(`No existe ningún usuario con id ${userId}`);
    }

    const u = rows[0];

    if (!u.avatar_bin) {
      throw new Error(
        `El usuario ${u.nick} (${userId}) todavía no tiene avatar guardado. ` +
          `Guardá el avatar por defecto desde el Bazar y volvé a correr el script.`,
      );
    }

    if (u.sexo === 'M') {
      console.warn(
        `⚠  El usuario ${u.nick} tiene sexo="M" (mujer). Este script genera el default de` +
          ` HOMBRE (default-avatar.ts) — si la idea era regenerar el de mujer, usá` +
          ` generate-female-default-avatar.js en su lugar.`,
      );
    }

    const avatarBase64 = Buffer.from(u.avatar_bin).toString('base64');
    const thumbBase64 = u.avatar_thumb_bin
      ? Buffer.from(u.avatar_thumb_bin).toString('base64')
      : avatarBase64;

    if (!u.avatar_thumb_bin) {
      console.warn('⚠  No hay avatar_thumb_bin guardado; se usa la imagen completa como thumb.');
    }

    fs.writeFileSync(
      OUT_PATH,
      fileContents({
        avatarBase64,
        thumbBase64,
        avatarData: u.avatarData,
        sourceNick: u.nick,
        sourceUserId: userId,
      }),
    );

    console.log(`✔  Escrito ${path.relative(path.join(__dirname, '..'), OUT_PATH)}`);
    console.log(`   avatar: ${(u.avatar_bin.length / 1024).toFixed(1)} KB, ` +
      `thumb: ${((u.avatar_thumb_bin?.length ?? u.avatar_bin.length) / 1024).toFixed(1)} KB`);
    console.log('   avatarData:', JSON.stringify(u.avatarData));
    console.log('   Ahora: revisar el diff, commit + push + redeploy para que aplique a los nuevos registros.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
