import { IsOptional, IsString, Length, Matches, MinLength } from 'class-validator';

// El certificado (.p12/.pfx) llega aparte como archivo multipart
// (@UploadedFile), no en este DTO — ver AppController.crearEmpresa.
export class CrearEmpresaDto {
  @IsString()
  @Matches(/^\d{11}$/, { message: 'El RUC debe tener 11 dígitos' })
  ruc: string;

  @IsString()
  @MinLength(3)
  razonSocial: string;

  // Sede (servicio-identidad) a la que emite esta empresa — opcional: se
  // puede configurar SUNAT antes de decidir la sede, o dejarla sin asignar
  // (mismo criterio que el resto de campos "todavía no configurado").
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

  // "0000" = domicilio fiscal/matriz — casi siempre correcto, se deja
  // configurable por si el emisor factura desde un local anexo.
  @IsOptional()
  @IsString()
  codigoEstablecimiento?: string;

  @IsString()
  @MinLength(1)
  solUsuario: string;

  @IsString()
  @MinLength(1)
  solClave: string;

  @IsString()
  @MinLength(1)
  certificadoPass: string;
}
