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
