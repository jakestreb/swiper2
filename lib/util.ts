interface Response {
  regex: RegExp;
  value: string;
}

export function getMorning(): Date {
  let morn = new Date();
  morn.setHours(0);
  morn.setMinutes(0);
  morn.setSeconds(0, 0);
  return morn;
};

export function splitFirst(input: string): [string, string] {
  let broken = input.split(' ');
  return [broken[0], broken.slice(1).join(' ')];
};

export function removePrefix(str: string, prefix: string): string {
  const l = prefix.length;
  if (str.slice(0, l) === prefix) {
    return str.slice(l);
  } else {
    throw new Error('removePrefix failed: given prefix string is not prefix');
  }
};

export function execCapture(str: string, regex: RegExp) {
  let match = regex.exec(str);
  if (!match) {
    // See: https://stackoverflow.com/a/16046903/9737244
    const numCaptures = (new RegExp(regex.source + '|')).exec('').length - 1;
    return new Array(numCaptures);
  }
  return match.slice(1);
};

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
