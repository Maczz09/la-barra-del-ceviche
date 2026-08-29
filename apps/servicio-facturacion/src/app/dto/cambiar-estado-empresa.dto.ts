import { IsBoolean } from 'class-validator';

export class CambiarEstadoEmpresaDto {
  @IsBoolean()
  activo: boolean;
}
