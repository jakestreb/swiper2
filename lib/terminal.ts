import {terminal as term} from 'terminal-kit';

const DEBUG = Boolean(parseInt(process.env.DEBUG || "0", 10));

export function prompt(prefix: string = ''): void {
  term(`${prefix}> `);
}

export function log(str: string = ''): void {
  term.eraseLine();
  term.column(0);
  term(`${str}\n`);
}

export function logDebug(str: string = ''): void {
  if (DEBUG) {
    term.eraseLine();
    term.column(0);
    term.magenta(`${str}`);
    prompt('\n');
  }
}

export function logInputError(str: string = ''): void {
  term.eraseLine();
  term.column(0);
  term.red(`${str}\n`);
}

export function logError(str: string = ''): void {
  term.eraseLine();
  term.column(0);
  term.bgRed(`${str}\n`);
}

export function logSubProcess(str: string = ''): void {
  const whitespace = Math.max(0, term.width - str.length - 2);
  term.eraseLine();
  term.column(whitespace);
  term.inverse(` ${str} `);
  prompt('\n');
}

export function logSubProcessError(str: string = ''): void {
  const whitespace = Math.max(0, term.width - str.length - 2);
  term.eraseLine();
  term.column(whitespace);
  term.bgRed(` ${str} `);
  prompt('\n');
}

export function logForeignResponse(str: string = ''): void {
  const whitespace = Math.max(0, term.width - str.length - 2);
  term.eraseLine();
  term.column(whitespace);
  term.green(` ${str} `);
  prompt('\n');
}

export function logForeignInputError(str: string = ''): void {
  const whitespace = Math.max(0, term.width - str.length - 2);
  term.eraseLine();
  term.column(whitespace);
  term.red(` ${str} `);
  prompt('\n');
}
