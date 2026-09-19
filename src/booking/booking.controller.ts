import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  AuthenticatedGuard,
  TrainerAllowed,
  currentAdmin,
} from '../auth/guards';
import {
  UserGuard,
  currentUserId,
  optionalUserId,
} from '../account/account.module';
import { BookingService } from './booking.service';
import {
  AnnouncementBookingDto,
  CartBookingDto,
  CreateSlotDto,
  CreateWeekdaySlotsDto,
  MoveClientBookingDto,
  RemoveSlotDto,
  SingleBookingDto,
  UpdateSlotDto,
} from './dto';
import { IdPipe } from '../common/id.pipe';

@TrainerAllowed()
@Controller('booking')
export class BookingController {
  constructor(private readonly booking: BookingService) {}

  @Get('slots')
  available(@Query('formatId') formatId?: string) {
    return this.booking.availableSlots(formatId ? Number(formatId) : undefined);
  }

  @Get('diagnostics')
  diagnostics() {
    return this.booking.diagnosticSlots();
  }

  @Post('single')
  bookSingle(@Body() dto: SingleBookingDto, @Req() req: Request) {
    return this.booking.bookSingle(dto, optionalUserId(req));
  }

  @UseGuards(UserGuard)
  @Post('cart')
  bookCart(@Body() dto: CartBookingDto, @Req() req: Request) {
    return this.booking.bookCart(dto, currentUserId(req));
  }

  @Post('announcement')
  bookAnnouncement(@Body() dto: AnnouncementBookingDto, @Req() req: Request) {
    return this.booking.bookAnnouncement(dto, optionalUserId(req));
  }

  @UseGuards(AuthenticatedGuard)
  @Get('admin/slots')
  allSlots() {
    return this.booking.allSlots();
  }

  @UseGuards(AuthenticatedGuard)
  @Post('slots')
  createSlot(@Body() dto: CreateSlotDto, @Req() req: Request) {
    return this.booking.createSlot(dto, currentAdmin(req));
  }

  @UseGuards(AuthenticatedGuard)
  @Post('slots/weekdays')
  createWeekdays(@Body() dto: CreateWeekdaySlotsDto, @Req() req: Request) {
    return this.booking.createWeekdaySlots(dto, currentAdmin(req));
  }

  @UseGuards(AuthenticatedGuard)
  @Put('slots/:id')
  updateSlot(
    @Param('id', IdPipe) id: number,
    @Body() dto: UpdateSlotDto,
    @Req() req: Request,
  ) {
    return this.booking.updateSlot(id, dto, currentAdmin(req));
  }

  @UseGuards(AuthenticatedGuard)
  @Delete('slots/:id')
  removeSlot(
    @Param('id', IdPipe) id: number,
    @Body() dto: RemoveSlotDto,
    @Req() req: Request,
  ) {
    return this.booking.removeSlot(id, dto ?? {}, currentAdmin(req));
  }

  @UseGuards(AuthenticatedGuard)
  @Post('admin/bookings/:id/move')
  moveClientBooking(
    @Param('id', IdPipe) id: number,
    @Body() dto: MoveClientBookingDto,
    @Req() req: Request,
  ) {
    return this.booking.moveClientBooking(id, dto.slotId, currentAdmin(req));
  }

  @UseGuards(AuthenticatedGuard)
  @Get('admin/bookings')
  bookings() {
    return this.booking.listBookings();
  }
}
