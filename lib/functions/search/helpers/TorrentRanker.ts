import ResourcePriority from './ResourcePriority';
import * as util from '../../../util';
import logger from '../../../util/logger';

class ResolutionPriority extends ResourcePriority<string> {
  public ranks = ['1080p', '2160p', '720p', '']; // TODO: Make 4k top priority once pc is upgraded
  public predicate = (v: string, t: PartialTorrent) => t.resolution === v || !v;
  public scale = 1;
}

class SeederPriority extends ResourcePriority<number> {
  public ranks = [30, 25, 20, 16, 12, 8, 4, 0];
  public predicate = (v: number, t: PartialTorrent) => t.seeders >= v;
  public scale = 3.5;
}

class SizePriority extends ResourcePriority<[number, number]> {
  public ranks: [number, number][] = [[1200, 7000], [1000, 8000], [800, 10000], [100, 15000]];
  public predicate = (v: [number, number], t: PartialTorrent) =>
      t.sizeMb >= v[0] && t.sizeMb <= v[1];
  public scale = 1.5;
}

class TitlePriority extends ResourcePriority<boolean> {
  public ranks = [true];
  public predicate = (v: boolean, t: PartialTorrent) => {
    const title = this.video.getFileSafeTitle();
    let regex = util.normalizeTitle(title).split(/\s/).join('[\\W]+'); // Allow any word separators parsed
    regex = `(?<![a-z].*)${regex}(?!.*[a-z])`; // Allow no extra words in parsed
    let { parsedTitle } = t;
    parsedTitle = util.normalizeTitle(parsedTitle);
    const isMatch = !!parsedTitle.match(new RegExp(regex, 'i'));
    logger.info(`Is expected title: ${parsedTitle} - ${isMatch}`)
    return isMatch;
  }
  public scale = 0;
}

export default class TorrentRanker {
  private static AUTO_REJECT = [
    "HDCAM", "CAMRip", "CAM", "TS", "TELESYNC", "PDVD",
    "HD-?TS", "HD-?TC", "WP", "WORKPRINT", "HC", "SUB",
    "SUBS", "KORSUB", "KOR", "TS-?RIP", "HQCAM", "HINDI",
    "DUBBED", "DUB",
  ];

  private priorities: ResourcePriority<any>[] = [];

  constructor(public video: IVideo) {
    this.priorities = [
      new TitlePriority(this.video),
      new SeederPriority(this.video),
      new SizePriority(this.video),
      new ResolutionPriority(this.video),
    ];
  }

  public getScore(t: PartialTorrent) {
    const rejected = TorrentRanker.AUTO_REJECT.find(r =>
      t.title.match(new RegExp(`\\b${r}\\b`, 'gi')));

    if (rejected) {
      return 0;
    }

    const scores = this.priorities.map(p => p.getScore(t));
    if (scores.some(x => x === -1)) {
      return 0;
    }
    return util.sum(scores);
  }

  // Gives a star rating from 0-5
  public getStars(t: PartialTorrent): 0|1|2|3|4|5 {
    const maxRating = util.sum(this.priorities.map(p => p.scale));
    const score = this.getScore(t);
    if (score === maxRating) {
      return 5;
    }
    const frac = score / maxRating;
    return Math.ceil(frac * 4) as 0|1|2|3|4;
  }
}
