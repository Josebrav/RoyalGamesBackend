import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { MailingService } from '../mailing/mailing.service';
import { SubmitContactDto } from './dtos/submit-contact.dto';

// Buzón personal del dueño (distinto del SUPPORT_EMAIL general que usan tickets/postulaciones) —
// a pedido, este formulario tiene que llegar específicamente acá.
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || 'josebravo2015@gmail.com';

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(private mailingService: MailingService) {}

  async submitContact(dto: SubmitContactDto) {
    const result = await this.mailingService.sendMail({
      to: CONTACT_EMAIL,
      subject: `[Contacto] ${dto.name}`,
      html: `
        <h2>Nuevo mensaje de contacto</h2>
        <p><strong>Nombre:</strong> ${dto.name}</p>
        <p><strong>Email:</strong> ${dto.email}</p>
        <p><strong>Mensaje:</strong></p>
        <p>${dto.message}</p>
      `,
    });

    if (!result?.success) {
      this.logger.error(`Failed to send contact email for ${dto.email}`);
      throw new BadRequestException('No se pudo enviar tu mensaje. Intentá de nuevo más tarde.');
    }

    return { message: 'Contact message sent' };
  }
}
