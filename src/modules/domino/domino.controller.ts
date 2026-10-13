import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DominoService } from './domino.service';
import { CreateDominoTableDto, DominoPlayerDto, ListDominoTablesQuery } from './dtos/domino-table.dto';

// Sin guard, mismo criterio que bingo/games: lo consulta el cliente Unity (WebGL), que no tiene
// JWT propio. Por ahora solo maneja mesas (quien esta sentado donde); no mueve fichas de nadie.
@ApiTags('Domino')
@Controller('domino')
export class DominoController {
  constructor(private readonly dominoService: DominoService) {}

  @Get('rooms')
  @ApiOperation({ summary: 'Mesas abiertas (la mas nueva primero). Con ?playerId= cuenta como "sigo en la sala".' })
  listRooms(@Query() query: ListDominoTablesQuery) {
    return this.dominoService.listTables(query.playerId);
  }

  @Post('rooms')
  @ApiOperation({ summary: 'Crea una mesa (1v1, 1v1v1, 1v1v1v1, 2v2) con quien la crea sentado' })
  createRoom(@Body() dto: CreateDominoTableDto) {
    const { mode, betAmount, ...player } = dto;
    return this.dominoService.createTable(mode, betAmount, player);
  }

  @Post('rooms/:id/join')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sentarse en una mesa (primer asiento libre)' })
  joinRoom(@Param('id') id: string, @Body() dto: DominoPlayerDto) {
    return this.dominoService.joinTable(id, dto);
  }

  @Post('rooms/:id/leave')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Levantarse de una mesa' })
  leaveRoom(@Param('id') id: string, @Body() dto: DominoPlayerDto) {
    this.dominoService.leaveTable(id, dto.playerId);
    return { ok: true };
  }
}
