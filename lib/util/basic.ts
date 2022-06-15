
export function sum(array: number[]): number {
  return array.reduce((a, b) => a + b, 0);
}

export function max<T>(array: T[], callback?: (elem: T) => any): T|null {
  let best: T|null = null;
  let bestScore = -Infinity;
  array.forEach(elem => {
    const score = callback ? callback(elem) : elem;
    if (score > bestScore) {
      best = elem;
      bestScore = score;
    }
  });
  return best;
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms < 0 ? 0 : ms);
  });
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
