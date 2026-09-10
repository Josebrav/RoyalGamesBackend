require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Genera src/common/constants/default-female-avatar.ts a partir del avatar ya guardado por
// una cuenta MUJER de prueba (misma idea que el masculino en default-avatar.ts).
//
// Uso:  node scripts/generate-female-default-avatar.js <userId>
//
// Pasos previos: cargar el arte de mujer en Unity, correr el Bazar con esa cuenta, dejar el
// look por defecto y tocar GUARDAR (eso sube avatar_bin / avatar_thumb_bin / avatarData).

const userId = process.argv[2];

if (!userId) {
  console.error('Falta el userId.  Uso: node scripts/generate-female-default-avatar.js <userId>');
  process.exit(1);
}

const OUT_PATH = path.join(__dirname, '..', 'src', 'common', 'constants', 'default-female-avatar.ts');

function fileContents({ avatarBase64, thumbBase64, avatarData }) {
  const dataJson = JSON.stringify(avatarData, null, 2);
  return `/**
 * Snapshot del avatar por defecto para cuentas MUJER (sexo === 'M'), equivalente al de
 * default-avatar.ts pero para el modelo femenino del Bazar. Igual que el masculino, es una
 * copia fija horneada en el código al momento de crear la cuenta — NO una referencia viva a
 * ninguna fila de usuario.
 *
 * Regenerado por scripts/generate-female-default-avatar.js a partir del avatar guardado por
 * la cuenta de prueba mujer ${userId}. Para volver a generarlo: guardar de nuevo ese avatar
 * en el Bazar y correr el script otra vez con el mismo id.
 */

export const DEFAULT_FEMALE_AVATAR_READY: boolean = true;

export const DEFAULT_FEMALE_AVATAR_MIME = 'image/png';

export const DEFAULT_FEMALE_AVATAR_BASE64 =
  '${avatarBase64}';

export const DEFAULT_FEMALE_AVATAR_BUFFER: Buffer | null = DEFAULT_FEMALE_AVATAR_BASE64
  ? Buffer.from(DEFAULT_FEMALE_AVATAR_BASE64, 'base64')
  : null;

export const DEFAULT_FEMALE_AVATAR_THUMB_BASE64 =
  '${thumbBase64}';

export const DEFAULT_FEMALE_AVATAR_THUMB_BUFFER: Buffer | null = DEFAULT_FEMALE_AVATAR_THUMB_BASE64
  ? Buffer.from(DEFAULT_FEMALE_AVATAR_THUMB_BASE64, 'base64')
  : null;

export const DEFAULT_FEMALE_AVATAR_DATA: Record<string, unknown> | null = ${dataJson};
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
      `SELECT nick, sexo, "avatarData", avatar_bin, avatar_thumb_bin
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

    if (u.sexo !== 'M') {
      console.warn(
        `⚠  El usuario ${u.nick} tiene sexo="${u.sexo}", no "M". Se genera igual, pero ` +
          `asegurate de que sea el avatar femenino que querés como default.`,
      );
    }

    const avatarBase64 = Buffer.from(u.avatar_bin).toString('base64');
    const thumbBase64 = u.avatar_thumb_bin
      ? Buffer.from(u.avatar_thumb_bin).toString('base64')
      : avatarBase64;

    if (!u.avatar_thumb_bin) {
      console.warn('⚠  No hay avatar_thumb_bin guardado; se usa la imagen completa como thumb.');
    }

    fs.writeFileSync(OUT_PATH, fileContents({ avatarBase64, thumbBase64, avatarData: u.avatarData }));

    console.log(`✔  Escrito ${path.relative(path.join(__dirname, '..'), OUT_PATH)}`);
    console.log(`   avatar: ${(u.avatar_bin.length / 1024).toFixed(1)} KB, ` +
      `thumb: ${((u.avatar_thumb_bin?.length ?? u.avatar_bin.length) / 1024).toFixed(1)} KB`);
    console.log('   Ahora: commit + push + redeploy para que aplique a los nuevos registros mujer.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
