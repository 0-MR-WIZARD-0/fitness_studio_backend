import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  async sendGiftCode(email: string | undefined, code: string): Promise<void> {
    if (!email) {
      this.logger.warn(`Подарочный промокод ${code} — email не указан`);
      return;
    }
    this.logger.log(
      `[MAIL] → ${email}: подарочный промокод «${code}» на бесплатное занятие`,
    );
  }
}
