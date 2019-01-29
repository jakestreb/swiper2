import {terminal as term} from 'terminal-kit';

const DEBUG = Boolean(parseInt(process.env.DEBUG || "0", 10));

export function prompt(): void {
  term(`\n> `);
}

export function logDebug(str: string = ''): void {
  if (DEBUG) {
    term.magenta(str);
  }
}

export function log(str: string = ''): void {
  term(str);
}

export function logInputError(str: string = ''): void {
  term.red(str);
}

export function logError(str: string = ''): void {
  term.bgRed(str);
}

export function logSubProcess(str: string = ''): void {
  const whitespace = Math.max(0, term.width - str.length - 2);
  term.eraseLine();
  term.column(whitespace);
  term.inverse(` ${str} `);
  prompt();
}

export function logSubProcessError(str: string = ''): void {
  const whitespace = Math.max(0, term.width - str.length - 2);
  term.eraseLine();
  term.column(whitespace);
  term.bgRed(` ${str} `);
  prompt();
}
