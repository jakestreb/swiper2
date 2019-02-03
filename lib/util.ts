interface Response {
  regex: RegExp;
  value: string;
}

const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms < 0 ? 0 : ms);
  });
}

// Returns a Date representing 12AM of the day it is in the current timezone.
export function getMorning(): Date {
  const offset = (new Date()).getTimezoneOffset();
  const now = Date.now();
  const nowTz = now - (offset * 60 * 1000);
  const morn = new Date(nowTz);
  morn.setUTCHours(0);
  morn.setUTCMinutes(0);
  morn.setUTCSeconds(0, 0);
  return morn;
}

// Given a daily time in hours (0 - 23), returns the time until that hour in ms.
export function getMsUntil(hour: number): number {
  const now = new Date();
  const searchTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour);
  const msUntil = searchTime.valueOf() - now.valueOf();
  // If the time has passed, add a full day.
  return msUntil < 0 ? msUntil + 86400000 : msUntil;
}

// Given the number of days until the given date (rounded down).
export function getDaysUntil(date: Date): number {
  const now = new Date();
  const msUntil = date.valueOf() - now.valueOf();
  return Math.floor(msUntil / 86400000);
}

export function splitFirst(input: string): [string, string] {
  const broken = input.split(' ');
  return [broken[0], broken.slice(1).join(' ')];
}

export function removePrefix(str: string, prefix: string): string {
  const l = prefix.length;
  if (str.slice(0, l) === prefix) {
    return str.slice(l);
  } else {
    throw new Error('removePrefix failed: given prefix string is not prefix');
  }
}

export function execCapture(str: string, regex: RegExp): Array<string|null> {
  const match = regex.exec(str);
  if (!match) {
    // See: https://stackoverflow.com/a/16046903/9737244
    const captureMatches = new RegExp(regex.source + '|').exec('');
    if (!captureMatches) {
      throw new Error(`Error in execCapture: no capture groups in regex`);
    }
    return new Array(captureMatches.length - 1).map(() => null);
  }
  return match.slice(1);
}

export function matchResp(input: string, responses: Response[]): string|null {
  let matched: string|null = null;
  responses.forEach(resp => {
    if (input.match(resp.regex)) {
      if (!matched) {
        matched = resp.value;
      } else {
        return null;
      }
    }
  });
  return matched;
}

export function matchYesNo(input: string, other: Response[] = []): string|null {
  return matchResp(input, [{
    value: 'yes',
    regex: /\b(y)|(yes)\b/gi
  }, {
    value: 'no',
    regex: /\b(n)|(no)\b/gi
  }].concat(other));
}

export function matchNumber(input: string, other: Response[] = []): string|null {
  return matchResp(input, [{
    value: 'number',
    regex: /\b[0-9]+\b/gi
  }].concat(other));
}

// Parses date strings of the form "02 Nov 2018".
// Note that null dates in OMDB are represented by "N/A" and should give null.
export function getDateFromStr(dateStr: string): Date|null {
  if (!dateStr || !dateStr.match(/\d/g)) {
    return null;
  } else {
    return new Date(dateStr);
  }
}

export function padZeros(int: number): string {
  return ('00' + int).slice(-2);
}

export function getAiredStr(date: Date): string {
  const oneDay = 86400000;
  const twoDays = 2 * oneDay;
  const oneWeek = 7 * oneDay;
  const sixMonths = 182 * oneDay;
  const weekday = weekdays[date.getDay()];
  const month = months[date.getMonth()];
  const calDay = date.getDate();
  const year = date.getFullYear();
  const diff = date.getTime() - getMorning().getTime();
  if (diff < -sixMonths) {
    return `Last aired ${month} ${calDay}, ${year}`;
  } else if (diff < -oneWeek) {
    // Over a week ago
    return `Last aired ${weekday}, ${month} ${calDay}`;
  } else if (diff < -oneDay) {
    // In the week
    return `Last aired ${weekday}`;
  } else if (diff < 0) {
    return `Last aired yesterday`;
  } else if (diff < oneDay) {
    return `Airs today at ${_getTimeString(date)}`;
  } else if (diff < twoDays) {
    return `Airs tomorrow at ${_getTimeString(date)}`;
  } else if (diff < oneWeek) {
    // In the next week
    return `Next airs ${weekday} at ${_getTimeString(date)}`;
  } else if (diff < sixMonths) {
    // More than a week ahead
    return `Next airs ${weekday}, ${month} ${calDay}`;
  } else {
    // More than 6 months ahead
    return `Next airs ${month} ${calDay}, ${year}`;
  }
}

function _getTimeString(date: Date): string {
  const hours = date.getHours();
  const minutesStr = (date.getMinutes() + '0').slice(0, 2);
  const ampm = hours < 12 ? 'am' : 'pm';
  return `${hours % 12 || 12}:${minutesStr}${ampm}`;
}
