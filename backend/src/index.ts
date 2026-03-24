import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { webhookRoutes } from './api/webhook'
import { jobsRoutes } from './api/jobs'
import { dossiersRoutes } from './api/dossiers'
import { researchRoutes } from './api/research'

const app = Fastify({ logger: { level: process.env.LOG_LEVEL || 'info' } })

async function bootstrap() {
  // CORS
  await app.register(cors, { origin: '*' })

  // Health check
  app.get('/health', async () => ({
    status: 'ok',
    version: process.env.npm_package_version || '1.0.0',
    timestamp: new Date().toISOString()
  }))

  // Rotas
  await app.register(webhookRoutes, { prefix: '/webhook' })
  await app.register(jobsRoutes, { prefix: '/api/jobs' })
  await app.register(dossiersRoutes, { prefix: '/api/dossiers' })
  await app.register(researchRoutes)

  const port = Number(process.env.PORT) || 3000
  await app.listen({ port, host: '0.0.0.0' })
  console.log(`🚀 ORBIT Backend rodando na porta ${port}`)
}

bootstrap().catch((err) => {
  console.error('Erro fatal ao iniciar servidor:', err)
  process.exit(1)
})
