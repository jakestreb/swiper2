import {terminal as term} from 'terminal-kit';
import * as winston from 'winston';

const DEBUG = Boolean(parseInt(process.env.DEBUG || "0", 10));

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'user-service' },
  transports: [
    new winston.transports.File({ filename: 'debug.log' })
  ]
});

logger.info("Starting up...");

export function prompt(prefix: string = ''): void {
  term(`${prefix}> `);
}

export function log(str: string = ''): void {
  term.eraseLine();
  term.column(0);
  term(`${str}\n`);
  logger.info(str);
}

export function logDebug(str: string = ''): void {
  if (DEBUG) {
    term.eraseLine();
    term.column(0);
    term.magenta(`${str}`);
    prompt('\n');
  }
  logger.debug(str);
}

export function logInputError(str: string = ''): void {
  term.eraseLine();
  term.column(0);
  term.red(`${str}\n`);
  logger.error(str);
}

export function logError(str: string = ''): void {
  term.eraseLine();
  term.column(0);
  term.bgRed(`${str}\n`);
  logger.error(str);
}

export function logSubProcess(str: string = ''): void {
  const whitespace = Math.max(0, term.width - str.length - 2);
  term.eraseLine();
  term.column(whitespace);
  term.inverse(` ${str} `);
  prompt('\n');
  logger.info(str);
}

export function logSubProcessError(str: string = ''): void {
  const whitespace = Math.max(0, term.width - str.length - 2);
  term.eraseLine();
  term.column(whitespace);
  term.bgRed(` ${str} `);
  prompt('\n');
  logger.error(str);
}

export function logForeignResponse(str: string = ''): void {
  const whitespace = Math.max(0, term.width - str.length - 2);
  term.eraseLine();
  term.column(whitespace);
  term.green(` ${str} `);
  prompt('\n');
  logger.info(str);
}

export function logForeignInputError(str: string = ''): void {
  const whitespace = Math.max(0, term.width - str.length - 2);
  term.eraseLine();
  term.column(whitespace);
  term.red(` ${str} `);
  prompt('\n');
  logger.error(str);
}
