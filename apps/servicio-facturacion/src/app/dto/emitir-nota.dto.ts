import { ArrayMinSize, IsArray, IsNumber, IsPositive, IsString, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ItemNotaDto {
  @IsString()
  @MinLength(1)
  descripcion: string;

  @IsNumber()
  @IsPositive()
  cantidad: number;

  @IsNumber()
  @IsPositive()
  precioUnitarioConIgv: number;
}

// Motivo se valida contra el catálogo 09/10 SUNAT en el servicio (no acá:
// depende de si es crédito o débito, algo que el DTO no distingue por sí
// solo). La descripción del motivo no viaja en el DTO — el servicio la toma
// del catálogo, así el código y su texto nunca pueden desincronizarse.
export class EmitirNotaDto {
  @IsString()
  @MinLength(1)
  motivoCodigo: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ItemNotaDto)
  items: ItemNotaDto[];
}
