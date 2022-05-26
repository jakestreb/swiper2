// Examples:
//
// 2022-06-07T00:00:00.000Z
// 2022-05-10 04:26:29
// 5pm May. 10th
// 2022-05-10 04:09:25 +0000
// Tue, 10 May 2022 04:58:32 GMT
type Part = 'M'|'D'|'Y'|'h'|'m'|'s'|'cf';

export default class DateParser {

  public static parse(str: string): Date|null {
    return new DateParser().parse(str);
  }

  // Assume 2-digit years are no more than 5 years into the future
  private lookaheadYears = 5;

  private Y: number|null = null; // 4-digit
  private M: number|null = null; // 1-indexed
  private D: number|null = null;
  private h: number|null = null; // not adjusted to cf
  private m: number|null = null;
  private s: number|null = null;
  private cf: 'am'|'pm'|null = null;

  private months = [
    'jan', 'feb', 'mar', 'apr', 'may', 'jun',
    'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
  ];
  private anyMonth = this.months.join('|');

  private order: [RegExp, Part[]][] = [
    [
      // 15:00:00
      // 4:30am
      /(?<!\d)(\d{1,2}):(\d{2})(?::(\d{2}))?(am?|pm?)?\b/i,
      ['h', 'm', 's', 'cf'],
    ],
    [
      // 6pm
      /(?<!\d)(\d{1,2})(am?|pm?)\b/i,
      ['h', 'cf'],
    ],
    [
      // 2022-06-07T00:00:00.000Z
      // 2020/12/25
      // 2014-06-02
      /(?<!\d)(\d{4})[-/](\d{2})[-/](\d{2})(?!\d)/,
      ['Y', 'M', 'D']
    ],
    [
      // 12/25/2020
      // 6-2-14
      /(?<!\d)(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})(?!\d)/,
      ['M', 'D', 'Y']
    ],
    [
      // 25/12/2020
      // 2-6-14
      /(?<!\d)(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})(?!\d)/,
      ['D', 'M', 'Y']
    ],
    [
      // 2 September 2020
      // 4 May '22
      new RegExp(`(\\d+)\\D+(${this.anyMonth})(?:\\D+(\\d{2,4}))?(?!\\d)`, 'i'),
      ['D', 'M', 'Y']
    ],
    [
      // September 2nd 2020
      // May 4 '22
      new RegExp(`\\b(${this.anyMonth})\\D+(\\d{2})(?:\\D+(\\d{2,4}))?(?!\\d)`, 'i'),
      ['M', 'D', 'Y']
    ],
  ];

  private get currentYear() {
    return new Date().getFullYear();
  }

  // Returns date if month and day are parsed
  public parse(str: string): Date|null {
    for (const pair of this.order) {
      const re = pair[0];
      const parts = pair[1];
      const matches = str.match(re);
      if (matches) {
        this.setParts(matches.slice(1), parts);
      }
    }
    if (!this.M || !this.D) {
      return null;
    }
    const Y = this.Y || this.currentYear;
    const M = this.M;
    const D = this.D;
    const h = (this.h && (this.cf === 'pm') ? this.h + 12 : this.h) || 0;
    const m = this.m || 0;
    const s = this.s || 0;
    return new Date(Date.UTC(Y, M - 1, D, h, m, s));
  }

  public setParts(strs: string[], parts: Part[]): void {
    if (strs.length > parts.length) {
      throw new Error('Invalid number of capture groups in regex');
    }
    if (parts.some(p => this[p])) {
      // If any match parts are already set, don't set any
      return;
    }
    strs.forEach((s, i) => {
      if (s) {
        this.setPart(s, parts[i]);
      }
    });
  }

  public setPart(s: string, p: Part): void {
    const num = parseInt(s, 10);
    switch (p) {
      case 'Y':
        this.Y = s.length === 2 ? this.parseYearAbbr(s) : parseInt(s, 10);
        break;
      case 'M':
        this.M = this.parseMonth(s);
        break
      case 'D':
        this.D = !isNaN(num) && num >= 1 && num <= 31 ? num : null;
        break;
      case 'h':
        this.h = !isNaN(num) && num >= 0 && num <= 11 ? num : null;
        break;
      case 'm':
        this.m = !isNaN(num) && num >= 0 && num <= 59 ? num : null;
        break;
      case 's':
        this.s = !isNaN(num) && num >= 0 && num <= 59 ? num : null;
        break;
      case 'cf':
        this.cf = s.includes('a') ? 'am' : (s.includes('p') ? 'pm' : null);
        break;
    }
  }

  public parseYearAbbr(s: string): number {
    const num = parseInt(s, 10);
    const basis = this.currentYear + this.lookaheadYears;
    const century = Math.floor(basis / 100) * 100;
    const digits = basis % 100;
    return num > digits ? century + num - 100 : century + num;
  }

  public parseMonth(s: string): number|null {
    const num = parseInt(s, 10);
    if (!isNaN(num)) {
      return num >= 1 && num <= 12 ? num : null;
    }
    let i = 0;
    while (i < this.months.length) {
      const re = new RegExp(this.months[i], 'i');
      if (s.match(re)) {
        return i + 1;
      }
      i += 1;
    }
    return null;
  }
}
