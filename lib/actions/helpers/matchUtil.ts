interface Response {
  regex: RegExp;
  value: string;
}

function matchResp(input: string, responses: Response[]): string|null {
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

export function matchYesNo(input: string = '', other: Response[] = []): string|null {
  return matchResp(input, [{
    value: 'yes',
    regex: /\b(y)|(yes)\b/gi
  }, {
    value: 'no',
    regex: /\b(n)|(no)\b/gi
  }].concat(other));
}

export function matchNumber(input: string = '', other: Response[] = []): string|null {
  return matchResp(input, [{
    value: 'number',
    regex: /\b[0-9]+\b/gi
  }].concat(other));
}
