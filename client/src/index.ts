import { v1 } from '@google-cloud/pubsub'
import { RetryOptions } from 'google-gax'

import { status as GrpcStatus } from '@grpc/grpc-js'
import { ChannelCredentials } from '@grpc/grpc-js'

import * as dotenv from 'dotenv'

import { logger } from './logger'
import * as util from 'node:util'
import * as fs from 'node:fs'
import * as tls from 'node:tls'

function deepInspect(obj: any) {
  return util.inspect(obj, { depth: Infinity })
}

function sleep(timeoutMs: number) {
  return new Promise(resolve => setTimeout(resolve, timeoutMs))
}

function getRetryOptions(): RetryOptions {
  // https://github.com/googleapis/nodejs-pubsub/blob/main/src/v1/publisher_client_config.json
  return {
    // The defaults for publish() are coded into the pubsub library
    // This is the same list as the library defaults
    retryCodes: [
      GrpcStatus.ABORTED,
      GrpcStatus.CANCELLED,
      GrpcStatus.DEADLINE_EXCEEDED,
      GrpcStatus.INTERNAL,
      GrpcStatus.RESOURCE_EXHAUSTED,
      GrpcStatus.UNAVAILABLE,
      GrpcStatus.UNKNOWN,
    ],
    backoffSettings: {
      initialRetryDelayMillis: 100,
      retryDelayMultiplier: 1.3,
      maxRetryDelayMillis: 60000,
      initialRpcTimeoutMillis: 5000, // default 60000
      rpcTimeoutMultiplier: 1.0,
      maxRpcTimeoutMillis: 60000,
      totalTimeoutMillis: 10000, // default 60000
    },
  }
}

// hax to track publish attempts
let globalCount = 0
let globalLastCount = 0
let globalTrailingRateArr: number[] = []

async function monitorProgress() {
  const maxMovingAvgSamples = 5
  // const periodMs = 10000
  const periodCount = globalCount - globalLastCount
  const periodRate = 1000 * (periodCount / periodMs)

  globalTrailingRateArr = [periodRate, ...globalTrailingRateArr.slice(0, maxMovingAvgSamples - 1)]

  const sma = globalTrailingRateArr.reduce((acc, i) => acc + i, 0) / globalTrailingRateArr.length

  logger.info('pubsub publish stats', {
    totalMessages: globalCount,
    messagesPerSecond: periodRate.toFixed(2),
    messagesPerSecondSimpleMovingAverage: sma.toFixed(2),
  })

  globalLastCount = globalCount
  setTimeout(monitorProgress, periodMs)
}

async function uselessWork() {
  for (var i = 0; i < 10; i++) {
    const doubled = i + i
    const templateLiteral = `${i} doubled is ${doubled}`
  }
  setTimeout(uselessWork, 1)
}

async function doWorkPublisherClient(projectId: string, topicName: string) {
  // secureContext: SecureContext, verifyOptions?: VerifyOptions
  const sslCreds = ChannelCredentials.createFromSecureContext(
    tls.createSecureContext({
      ca: fs.readFileSync(cacert)
    })
  )

  const publisherClient = new v1.PublisherClient(
    {
      projectId,
      "grpc.enable_channelz": 1,
      servicePath: servicePath,
      port: 50051,
      sslCreds,
      "grpc.ssl_target_name_override": "pubsub.cloudapis.test",

      // grpc keepalive settings
      // https://github.com/grpc/grpc-node/blob/af31ef0a3dff8bea43c7f89e6c25c51da4a99240/packages/grpc-js/src/transport.ts#L99-L107

      // The amount of time in between sending pings
      // "grpc.keepalive_time_ms": 30000,
      // The amount of time to wait for an acknowledgement after sending a ping
      // "grpc.keepalive_timeout_ms": 10000,
    }
  )

  const topic = publisherClient.projectTopicPath(
    projectId,
    topicName,
  )

  while (true) {
    try {
      await publisherClient.publish(
        // type protos.google.pubsub.v1.IPublishRequest
        {
          topic,
          messages: [
            {
              data: Buffer.from(globalCount.toString()),
              // attributes: {"foo": "bar"},
            }
          ]
        },
        {
          // type RetryOptions
          retry: getRetryOptions(),
        }
      )
    } catch (err) {
      logger.error("publishing message", { context: deepInspect(err) })
    }

    globalCount++
    await sleep(delayMs)
  }

}

async function startChannelzServer() {
  // https://github.com/grpc/grpc-node/issues/1941#issuecomment-945932412
  const grpc = require('@grpc/grpc-js')
  const server = new grpc.Server()
  grpc.addAdminServicesToServer(server)
  // Modify the first argument to suit your environment
  server.bindAsync(`localhost:${channelzPort}`, grpc.ServerCredentials.createInsecure(), (error: Error, port: number) => {
    logger.info("Serving channelz", { context: { port } })
    server.start();
  });
}

dotenv.config()

const projectId: string = process.env.APP_GCP_PROJECT_ID!
const topicName: string = process.env.APP_PUBSUB_TOPIC_NAME!
const periodMs: number = process.env.APP_PERIOD_MS !== undefined ? parseInt(process.env.APP_PERIOD_MS) : 10000
const delayMs: number = process.env.APP_DELAY_MS !== undefined ? parseInt(process.env.APP_DELAY_MS) : 500
const channelzPort: number = process.env.APP_CHANNELZ_PORT !== undefined ? parseInt(process.env.APP_CHANNELZ_PORT) : 5555
const cacert: string = process.env.APP_CACERT !== undefined ? process.env.APP_CACERT : './../cert/ca-cert.pem'
const servicePath: string = process.env.APP_SERVICE_PATH !== undefined ? process.env.APP_SERVICE_PATH : 'pubsub.cloudapis.test'

process.on('unhandledRejection', (err: Error) => {
  logger.error('unhandledRejection', { context: deepInspect(err) })
})

logger.info("starting")

doWorkPublisherClient(projectId, topicName)
// Can reproduce without spending time calling uselessWork() but it
// reproduces more quickly if we do it.
uselessWork()
monitorProgress()
startChannelzServer()
