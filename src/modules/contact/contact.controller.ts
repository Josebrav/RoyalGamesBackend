import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ContactService } from './contact.service';
import { SubmitContactDto } from './dtos/submit-contact.dto';

@ApiTags('Contact')
@Controller('contact')
export class ContactController {
  constructor(private contactService: ContactService) {}

  // Público y sin autenticar a propósito: cualquier visitante (incluso sin cuenta) puede escribir.
  @Post()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a message from the public contact form' })
  async submit(@Body() dto: SubmitContactDto) {
    return this.contactService.submitContact(dto);
  }
}
