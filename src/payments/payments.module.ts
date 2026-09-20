import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  Param,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { IdPipe } from '../common/id.pipe';

const PAID_STATUS = 'CONFIRMED';
const FAILED_STATUSES = [
  'REJECTED',
  'DEADLINE_EXPIRED',
  'CANCELED',
  'REVERSED',
  'REFUNDED',
  'PARTIAL_REFUNDED',
];

export interface PayableBooking {
  id: number;
  price: number;
  name: string;
  phone: string;
  email: string | null;
  title: string;
}

export interface PaymentStart {
  status: string;
  redirectUrl: string | null;
}

interface TinkoffReply {
  Success: boolean;
  ErrorCode?: string;
  Message?: string;
  Details?: string;
  Status?: string;
  PaymentId?: string;
  PaymentURL?: string;
  OrderId?: string;
}

@Injectable()
export class PaymentsService {
  private readonly log = new Logger('Payments');

  constructor(private readonly prisma: PrismaService) {}

  private get config() {
    const trim = (value?: string) => (value ?? '').replace(/\/+$/, '');
    return {
      terminalKey: process.env.TINKOFF_TERMINAL_KEY ?? '',
      password: process.env.TINKOFF_PASSWORD ?? '',
      api: trim(process.env.TINKOFF_API) || 'https://securepay.tbank.ru/v2',
      site:
        trim(process.env.PUBLIC_URL) ||
        trim(process.env.FRONTEND_URL) ||
        'http://localhost:3000',
      withReceipt: process.env.TINKOFF_RECEIPT === '1',
      taxation: process.env.TINKOFF_TAXATION ?? 'usn_income',
      vat: process.env.TINKOFF_VAT ?? 'none',
      holdMin: Math.max(5, Number(process.env.PAYMENT_HOLD_MIN ?? 20)),
    };
  }

  get enabled() {
    const { terminalKey, password } = this.config;
    return !!terminalKey && !!password;
  }

  private sign(params: Record<string, unknown>) {
    const values = Object.entries({
      ...params,
      Password: this.config.password,
    })
      .filter(
        ([key, value]) =>
          key !== 'Token' &&
          value !== undefined &&
          value !== null &&
          typeof value !== 'object',
      )
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, value]) => String(value));
    return createHash('sha256').update(values.join('')).digest('hex');
  }

  private async call(method: string, params: Record<string, unknown>) {
    const { api, terminalKey } = this.config;
    const payload = { TerminalKey: terminalKey, ...params };
    const res = await fetch(`${api}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, Token: this.sign(payload) }),
      signal: AbortSignal.timeout(15000),
    }).catch((e: Error) => {
      const cause = (e as { cause?: { code?: string; message?: string } })
        .cause;
      const reason =
        e.name === 'TimeoutError'
          ? 'банк не ответил за 15 с'
          : (cause?.code ?? cause?.message ?? e.message);
      this.log.error(`${method} к ${api}: ${reason}`);
      throw new ServiceUnavailableException(
        `Оплата временно недоступна (${reason}), попробуйте позже`,
      );
    });

    const data = (await res.json()) as TinkoffReply;
    if (!data.Success) {
      this.log.warn(
        `${method} отклонён: ${data.ErrorCode ?? '—'} ${data.Message ?? ''} ${
          data.Details ?? ''
        }`.trim(),
      );
      throw new ServiceUnavailableException(
        data.Message ? `Оплата: ${data.Message}` : 'Не удалось создать платёж',
      );
    }
    return data;
  }

  private receipt(booking: PayableBooking) {
    const { taxation, vat } = this.config;
    const amount = booking.price * 100;
    return {
      Taxation: taxation,
      ...(booking.email ? { Email: booking.email } : {}),
      ...(booking.phone ? { Phone: booking.phone } : {}),
      Items: [
        {
          Name: booking.title.slice(0, 128),
          Price: amount,
          Quantity: 1,
          Amount: amount,
          Tax: vat,
          PaymentMethod: 'full_prepayment',
          PaymentObject: 'service',
        },
      ],
    };
  }

  async start(
    booking: PayableBooking,
    alsoBookings: number[] = [],
  ): Promise<PaymentStart> {
    if (!this.enabled) {
      return {
        status: 'mock',
        redirectUrl: `/payment/mock?booking=${booking.id}`,
      };
    }
    const data = await this.init(booking, alsoBookings);

    await this.prisma.booking.updateMany({
      where: { id: { in: [booking.id, ...alsoBookings] } },
      data: {
        paymentId: data.PaymentId ?? null,
        paymentStatus: data.Status ?? 'NEW',
        paymentUrl: data.PaymentURL ?? null,
      },
    });
    return { status: 'tinkoff', redirectUrl: data.PaymentURL ?? null };
  }

  private async init(booking: PayableBooking, alsoBookings: number[]) {
    const { site, withReceipt } = this.config;
    try {
      return await this.call('Init', {
        Amount: booking.price * 100,
        OrderId: String(booking.id),
        Description: booking.title.slice(0, 250),
        SuccessURL: `${site}/payment/success?booking=${booking.id}`,
        FailURL: `${site}/payment/fail?booking=${booking.id}`,
        NotificationURL: `${site}/api/payments/tinkoff/notify`,
        DATA: {
          ...(booking.email ? { Email: booking.email } : {}),
          ...(booking.phone ? { Phone: booking.phone } : {}),
        },
        ...(withReceipt ? { Receipt: this.receipt(booking) } : {}),
      });
    } catch (e) {
      await this.prisma.booking.deleteMany({
        where: { id: { in: [booking.id, ...alsoBookings] } },
      });
      this.log.warn(`Заявка ${booking.id} снята: платёж не создан`);
      throw e;
    }
  }

  async resume(bookingId: number) {
    const state = await this.status(bookingId);
    if (state.paid) return { state: 'paid' as const, url: null };

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });
    if (!booking || booking.status === 'CANCELLED') {
      if (booking)
        await this.prisma.booking.delete({ where: { id: bookingId } });
      return { state: 'failed' as const, url: null };
    }
    return { state: 'pending' as const, url: booking.paymentUrl };
  }

  async refund(bookingId: number) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });
    if (!booking?.paymentId || booking.paymentStatus !== PAID_STATUS) return;
    try {
      const data = await this.call('Cancel', { PaymentId: booking.paymentId });
      await this.prisma.booking.update({
        where: { id: bookingId },
        data: { paymentStatus: data.Status ?? 'REFUNDED' },
      });
      this.log.log(`Возврат по записи ${bookingId}: ${data.Status ?? 'ok'}`);
    } catch {
      this.log.warn(
        `Возврат по записи ${bookingId} не прошёл, верните деньги вручную`,
      );
    }
  }

  private async applyStatus(bookingId: number, status: string) {
    const paid = status === PAID_STATUS;
    const failed = FAILED_STATUSES.includes(status);
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });
    await this.prisma.booking.updateMany({
      where: booking?.paymentId
        ? { paymentId: booking.paymentId }
        : { id: bookingId },
      data: {
        paymentStatus: status,
        ...(paid ? { status: 'PAID', paidAt: new Date() } : {}),
        ...(failed ? { status: 'CANCELLED' } : {}),
      },
    });
  }

  async notify(body: Record<string, unknown>) {
    if (!this.enabled) return 'OK';
    const token = String(body.Token ?? '');
    if (!token || token !== this.sign(body)) {
      this.log.warn('Уведомление с неверной подписью отклонено');
      throw new ForbiddenException('Неверная подпись');
    }
    const bookingId = Number(body.OrderId);
    const status = String(body.Status ?? '');
    if (bookingId && status) {
      const booking = await this.prisma.booking.findUnique({
        where: { id: bookingId },
      });
      if (booking) {
        await this.applyStatus(bookingId, status);
        this.log.log(`Запись ${bookingId}: платёж ${status}`);
      }
    }
    return 'OK';
  }

  async status(bookingId: number) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });
    if (!booking) throw new NotFoundException('Запись не найдена');

    if (
      this.enabled &&
      booking.paymentId &&
      booking.paymentStatus !== PAID_STATUS &&
      !FAILED_STATUSES.includes(booking.paymentStatus ?? '')
    ) {
      try {
        const data = await this.call('GetState', {
          PaymentId: booking.paymentId,
        });
        if (data.Status) {
          await this.applyStatus(bookingId, data.Status);
          booking.paymentStatus = data.Status;
          booking.status =
            data.Status === PAID_STATUS ? 'PAID' : booking.status;
        }
      } catch {
        //
      }
    }

    const paid = booking.paymentId
      ? await this.prisma.booking.findMany({
          where: { paymentId: booking.paymentId },
          include: {
            slot: { include: { format: true } },
            announcement: true,
            service: true,
            rentalSlot: { include: { hall: true } },
          },
          orderBy: { id: 'asc' },
        })
      : [];

    const items = paid.map((b) => ({
      title: b.slot?.isDiagnostic
        ? 'Диагностика'
        : (b.slot?.format?.name ??
          b.announcement?.title ??
          b.service?.title ??
          (b.rentalSlot
            ? `Аренда зала ${b.rentalSlot.hall?.title ?? ''}`.trim()
            : 'Занятие')),
      startsAt:
        b.slot?.startsAt ??
        b.announcement?.startsAt ??
        b.rentalSlot?.startsAt ??
        null,
      durationMin: b.slot?.durationMin ?? b.announcement?.durationMin ?? null,
    }));

    return {
      bookingId,
      paid: booking.status === 'PAID',
      free: booking.isFree,
      total: paid.length
        ? paid.reduce((sum, b) => sum + b.price, 0)
        : booking.price,
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      items,
    };
  }

  @Cron('*/5 * * * *')
  async releaseUnpaid() {
    if (!this.enabled) return;
    const deadline = new Date(Date.now() - this.config.holdMin * 60_000);
    const stale = await this.prisma.booking.findMany({
      where: {
        status: 'PENDING',
        price: { gt: 0 },
        paymentId: { not: null },
        paymentStatus: { notIn: [PAID_STATUS, ...FAILED_STATUSES] },
        createdAt: { lt: deadline },
      },
      select: { id: true },
    });
    for (const booking of stale) {
      await this.status(booking.id);
      const fresh = await this.prisma.booking.findUnique({
        where: { id: booking.id },
      });
      if (fresh?.status === 'PENDING') {
        await this.prisma.booking.update({
          where: { id: booking.id },
          data: { status: 'CANCELLED', paymentStatus: 'TIMEOUT' },
        });
        this.log.log(`Запись ${booking.id} снята: оплата не пришла`);
      }
    }
  }
}

@Controller('payments')
class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('tinkoff/notify')
  @HttpCode(200)
  notify(@Body() body: Record<string, unknown>) {
    return this.payments.notify(body);
  }

  @Get('status/:id')
  status(@Param('id', IdPipe) id: number) {
    return this.payments.status(id);
  }
}

@Module({
  providers: [PaymentsService],
  controllers: [PaymentsController],
  exports: [PaymentsService],
})
export class PaymentsModule {}
