import range = require('lodash/range');

export default class EpisodeParser {
  // Takes a human-entered input of seasons and episodes of the following form:
  //       'S01E01-04 & E06-E08, S03-S05, S06E02&6, S07 & S08'
  // Returns a SeasonEpisodes object.
  public static parse(input: string): EpisodesDescriptor|null {
    if (input.match(/upcoming/)) {
      return 'upcoming';
    } else if (input.match(/latest s/gi)) {
      return 'latest season';
    } else if (input.match(/latest e/gi)) {
      return 'latest episode';
    }
    return this.parseEpisodeString(input);
  }

  // Indicates whether the EpisodesDescriptor describes a single episode.
  public static describesOne(episodes: EpisodesDescriptor): boolean {
    if (episodes === 'latest episode') {
      return true;
    }
    if (episodes === 'upcoming' || episodes === 'latest season' || episodes === 'all') {
      return false;
    }
    const seasons = Object.keys(episodes);
    if (seasons.length !== 1) {
      return false;
    }
    return episodes[seasons[0]] !== 'all' && episodes[seasons[0]].length === 1;
  }

  private static parseEpisodeString(input: string): SeasonEpisodes|null {
    const numberStr = input.replace('season', 's').replace('episode', 'e');
    if (!input || input.match(/[^es\d\s-,&]/gi)) {
      // If there's no input or the input has unexpected characters, return null.
      return null;
    }
    const seasons: SeasonEpisodes = {};
    let lastChar: 's'|'e' = 's';
    let latestSeason: number = -1;
    let rangeStart: number = -1;
    let numStr: string = '';
    for (const c of [...numberStr, '&']) {
      if (c >= '0' && c <= '9') {
        // It's a number
        numStr += c;
      } else if (c === '-') {
        rangeStart = parseInt(numStr, 10);
        numStr = '';
      } else if (lastChar === 's' && (c === 'e' || c === '&' || c === ',')) {
        // Season numbers
        lastChar = c === 'e' ? 'e' : lastChar;
        if (numStr.length > 0) {
          latestSeason = parseInt(numStr, 10);
          if (rangeStart > -1) {
            range(rangeStart, latestSeason + 1).forEach((n: number) => { seasons[n] = 'all'; });
            rangeStart = -1;
          } else {
            seasons[latestSeason] = 'all';
          }
          numStr = '';
        }
      } else if (lastChar === 'e' && (c === 's' || c === '&' || c === ',')) {
        // Episode numbers
        lastChar = c === 's' ? 's' : lastChar;
        if (numStr.length > 0) {
          seasons[latestSeason] = seasons[latestSeason] === 'all' ? [] : seasons[latestSeason];
          const num = parseInt(numStr, 10);
          if (rangeStart > -1) {
            (seasons[latestSeason] as number[]).push(...range(rangeStart, num + 1));
            rangeStart = -1;
          } else {
            (seasons[latestSeason] as number[]).push(num);
          }
          numStr = '';
        }
      }
    }
    return seasons;
  }
}
