import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedGuard } from '../auth/guards';
import { BookingService } from './booking.service';
import {
  AnnouncementBookingDto,
  CartBookingDto,
  CreateSlotDto,
  CreateWeekdaySlotsDto,
  SingleBookingDto,
  UpdateSlotDto,
} from './dto';

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
  bookSingle(@Body() dto: SingleBookingDto) {
    return this.booking.bookSingle(dto);
  }

  @Post('cart')
  bookCart(@Body() dto: CartBookingDto) {
    return this.booking.bookCart(dto);
  }

  @Post('announcement')
  bookAnnouncement(@Body() dto: AnnouncementBookingDto) {
    return this.booking.bookAnnouncement(dto);
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
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSlotDto,
    @Req() req: { user?: { username?: string } },
  ) {
    return this.booking.updateSlot(id, dto, req.user?.username);
  }

  @UseGuards(AuthenticatedGuard)
  @Delete('slots/:id')
  removeSlot(@Param('id', ParseIntPipe) id: number) {
    return this.booking.removeSlot(id);
  }

  @UseGuards(AuthenticatedGuard)
  @Get('admin/bookings')
  bookings() {
    return this.booking.listBookings();
  }
}
