import { initTracing, apiTitle } from '@org/observabilidad';
initTracing('servicio-identidad');

import { config } from 'dotenv';
import { join } from 'node:path';
config({ path: join(__dirname, '../.env') });
import { bootstrapNachoppsService } from '@org/observabilidad/bootstrap';
import { AppModule } from './app/app.module';

void bootstrapNachoppsService({
  serviceName: 'servicio-identidad', module: AppModule, queue: 'identidad_queue', defaultPort: 3001,
  swagger: { title: apiTitle('Identidad'), description: 'Autenticación JWT, gestión de usuarios, roles y refresh tokens' },
});
