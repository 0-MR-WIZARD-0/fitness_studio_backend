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
import { AuthenticatedGuard } from '../auth/guards';
import { UserGuard, currentUserId } from '../account/account.module';
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

  @UseGuards(UserGuard)
  @Post('single')
  bookSingle(@Body() dto: SingleBookingDto, @Req() req: Request) {
    return this.booking.bookSingle(dto, currentUserId(req));
  }

  @UseGuards(UserGuard)
  @Post('cart')
  bookCart(@Body() dto: CartBookingDto, @Req() req: Request) {
    return this.booking.bookCart(dto, currentUserId(req));
  }

  @UseGuards(UserGuard)
  @Post('announcement')
  bookAnnouncement(@Body() dto: AnnouncementBookingDto, @Req() req: Request) {
    return this.booking.bookAnnouncement(dto, currentUserId(req));
  }

  @UseGuards(AuthenticatedGuard)
  @Get('admin/slots')
  allSlots() {
    return this.booking.allSlots();
  }

  @UseGuards(AuthenticatedGuard)
  @Post('slots')
  createSlot(@Body() dto: CreateSlotDto) {
    return this.booking.createSlot(dto);
  }

  @UseGuards(AuthenticatedGuard)
  @Post('slots/weekdays')
  createWeekdays(@Body() dto: CreateWeekdaySlotsDto) {
    return this.booking.createWeekdaySlots(dto);
  }

  @UseGuards(AuthenticatedGuard)
  @Put('slots/:id')
  updateSlot(
    @Param('id', IdPipe) id: number,
    @Body() dto: UpdateSlotDto,
    @Req() req: { user?: { username?: string } },
  ) {
    return this.booking.updateSlot(id, dto, req.user?.username);
  }

  @UseGuards(AuthenticatedGuard)
  @Delete('slots/:id')
  removeSlot(
    @Param('id', IdPipe) id: number,
    @Body() dto: RemoveSlotDto,
    @Req() req: { user?: { username?: string } },
  ) {
    return this.booking.removeSlot(id, dto, req.user?.username);
  }

  @UseGuards(AuthenticatedGuard)
  @Post('admin/bookings/:id/move')
  moveClientBooking(
    @Param('id', IdPipe) id: number,
    @Body() dto: MoveClientBookingDto,
  ) {
    return this.booking.moveClientBooking(id, dto.slotId);
  }

  @UseGuards(AuthenticatedGuard)
  @Get('admin/bookings')
  bookings() {
    return this.booking.listBookings();
  }
}
