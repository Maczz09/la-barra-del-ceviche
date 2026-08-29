import { IsOptional, IsString, Length, MinLength } from 'class-validator';

// Edición de una empresa ya configurada. El RUC no es editable: es la clave
// única de la fila y un dato legal que en la práctica nunca cambia. El
// certificado (.p12/.pfx) llega aparte como archivo multipart, opcional acá
// — solo se reemplaza si el admin sube uno nuevo (ver AppController y
// AppService.actualizarEmpresa: certificadoPass sin archivo nuevo, o archivo
// nuevo sin certificadoPass, se rechaza — van siempre juntos).
export class ActualizarEmpresaDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  razonSocial?: string;

  // Permite asignar/corregir la sede después de creada (ej. la primera
  // empresa, configurada antes de que existiera este campo). Vacío ('')
  // desvincula la sede — ver AppService.actualizarEmpresa.
  @IsOptional()
  @IsString()
  sedeId?: string;

  @IsOptional()
  @IsString()
  nombreComercial?: string;

  @IsOptional()
  @IsString()
  direccion?: string;

  @IsOptional()
  @IsString()
  @Length(6, 6, { message: 'El ubigeo tiene 6 dígitos' })
  ubigeo?: string;

  @IsOptional()
  @IsString()
  codigoEstablecimiento?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  solUsuario?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  solClave?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  certificadoPass?: string;
}
