interface Response {
  regex: RegExp;
  value: string;
}

const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];

export function getMorning(): Date {
  const morn = new Date();
  morn.setHours(0);
  morn.setMinutes(0);
  morn.setSeconds(0, 0);
  return morn;
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

export function execCapture(str: string, regex: RegExp) {
  const match = regex.exec(str);
  if (!match) {
    // See: https://stackoverflow.com/a/16046903/9737244
    const numCaptures = (new RegExp(regex.source + '|')).exec('').length - 1;
    return new Array(numCaptures);
  }
  return match.slice(1);
}

export function matchResp(input: string, responses: Response[]): string|null {
  let matched = null;
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

export function matchYesNo(input: string): string {
  return matchResp(input, [{
    value: 'yes',
    regex: /\b(y)|(yes)\b/gi
  }, {
    value: 'no',
    regex: /\b(n)|(no)\b/gi
  }]);
}

// Parses date strings of the form "02 Nov 2018".
// Note that null dates in OMDB are represented by "N/A" and should give null.
export function getDateFromStr(dateStr: string): Date|null {
  if (!dateStr.match(/\d/g)) {
    return null;
  } else {
    return new Date(dateStr);
  }
}

export function padZeros(int: number): string {
  return ('00' + int).slice(-2);
}

export function getAiredStr(date: Date): string {
  if (!date) {
    return null;
  }
  const oneDay = 86400000;
  const twoDays = 2 * oneDay;
  const oneWeek = 7 * oneDay;
  const sixMonths = 182 * oneDay;
  const weekday = weekdays[date.getDay()];
  const month = months[date.getMonth()];
  const calDay = date.getDate();
  const diff = date.getTime() - getMorning().getTime();
  if (diff < -sixMonths) {
    return `Last aired ${month} ${calDay}`;
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
    return `Airs ${weekday} at ${_getTimeString(date)}`;
  } else if (diff < sixMonths) {
    // More than a week ahead
    return `Airs ${weekday}, ${month} ${calDay}`;
  } else {
    // More than 6 months ahead
    return `Airs ${month} ${calDay}`;
  }
}
