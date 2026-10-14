import { FreeSpinSessionIdentityDto } from './free-spin-session-identity.dto';

/** Llamada al cargar el juego: si hay una ronda activa para este (userId, game), esta ventana la
 *  reclama (ver FreeSpinsService.resumeSession) sin importar quién la tenía antes. */
export class ResumeFreeSpinSessionDto extends FreeSpinSessionIdentityDto {}
