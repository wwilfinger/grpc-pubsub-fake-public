import { createLogger, format, transports } from 'winston'

const { combine, errors, timestamp, json } = format

export const logger = createLogger({
  format: combine(
    errors({ stack: true }),
    timestamp(),
    json()
  ),
  transports: [
    new transports.Console({
      stderrLevels: ['error'],
      handleExceptions: true,
      handleRejections: true,
    }),
  ],
  exitOnError: false
})
