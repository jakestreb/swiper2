import axios from 'axios';
import * as winston from 'winston';

const DEBUG = Boolean(parseInt(process.env.DEBUG || "0", 10));

const logger = winston.createLogger({
  level: DEBUG ? 'debug' : 'info',
  format: winston.format.prettyPrint(),
  transports: [
    new winston.transports.Console,
    new winston.transports.File({ filename: 'debug.log' })
  ]
});

axios.interceptors.request.use(request => {
  logger.info(`${request.method!.toUpperCase()} ${request.url}`);
  return request
})

axios.interceptors.response.use(response => {
  logger.info(`-> ${response.status}`);
  return response
})

logger.info("Starting up...");

export default logger;
