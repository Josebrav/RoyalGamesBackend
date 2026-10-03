export const ALLOWED_ORIGINS = [
  'https://royal-front-new.vercel.app',
  'http://localhost:5173',
  'https://html-classic.itch.zone',
  'https://royalpachinka.s3.us-east-2.amazonaws.com',
  'https://minas2royal.s3.us-east-2.amazonaws.com',
  'https://us-east-2.console.aws.amazon.com',
  'https://aws.amazon.com',
  'https://royaljoker1.s3.us-east-2.amazonaws.com',
  'https://royalgames.lat',
  'https://www.royalgames.lat',
  // royaljuegos.com (DonWeb) pasa a ser el dominio principal en español, reemplazando a
  // royalgames.lat en ese rol — royalgames.lat se reasigna al sitio en portugués. Se dejan AMBOS
  // (royalgames.lat y royaljuegos.com) permitidos durante la transición de dominios.
  'https://royaljuegos.com',
  'https://www.royaljuegos.com',
  // Sitios en inglés/portugués (repos separados RoyalFrontNew-EN/-PT, mismo backend). Nombres
  // reales que asignó Vercel (distintos de lo que se había supuesto al principio).
  'https://royal-front-new-en.vercel.app',
  'https://royal-front-new-pt.vercel.app',
  'https://minasroyal.s3.us-east-2.amazonaws.com',
  'https://baazaar.s3.us-east-2.amazonaws.com',
  'https://bingoroyal.s3.us-east-2.amazonaws.com',
  'https://santawilds.s3.us-east-2.amazonaws.com',
  'https://royalslots.s3.us-east-2.amazonaws.com',
  'https://sugarcalavera.s3.us-east-1.amazonaws.com',
];

export function isOriginAllowed(origin: string | undefined | null): boolean {
  if (!origin) {
    // Non-browser clients (native builds, server-to-server, wscat during QA) don't send Origin.
    return true;
  }
  return ALLOWED_ORIGINS.includes(origin);
}
