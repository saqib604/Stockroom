import 'reflect-metadata'
import { resolve } from 'node:path'
import { config } from 'dotenv'
import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

config({ path: resolve(__dirname, '../.env') })

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.setGlobalPrefix('api')
  const allowedOrigins = (process.env.WEB_ORIGIN ?? 'http://localhost:5173').split(',').map((origin) => origin.trim())
  app.enableCors({
    origin: [...allowedOrigins, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/],
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  app.enableShutdownHooks()
  await app.listen(Number(process.env.API_PORT ?? 3001), '0.0.0.0')
}
void bootstrap()
