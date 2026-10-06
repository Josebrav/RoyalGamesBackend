import { Module } from '@nestjs/common';
import { MailingModule } from '../mailing/mailing.module';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';

@Module({
  imports: [MailingModule],
  controllers: [ContactController],
  providers: [ContactService],
})
export class ContactModule {}
