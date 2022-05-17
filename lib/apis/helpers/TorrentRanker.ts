import ResourcePriority from './ResourcePriority';
import * as util from '../../util';

class ResolutionPriority extends ResourcePriority<string> {
  public ranks = ['1080p', '720p'];
  public predicate = (v: string, t: PartialTorrent) => t.resolution === v;
  public scale = 1;
}

class SeederPriority extends ResourcePriority<number> {
  public ranks = [30, 25, 20, 16, 12, 8, 4, 0];
  public predicate = (v: number, t: PartialTorrent) => t.seeders >= v;
  public scale = 3.5;
}

class SizePriority extends ResourcePriority<[number, number]> {
  public ranks: [number, number][] = [[1200, 4000], [1000, 5000], [800, 8000], [200, 10000]];
  public predicate = (v: [number, number], t: PartialTorrent) =>
      t.sizeMb >= v[0] && t.sizeMb <= v[1];
  public scale = 1.5;
}

class TitlePriority extends ResourcePriority<boolean> {
  public ranks = [true, false];
  public predicate = (v: boolean, t: PartialTorrent) =>
    v === (t.parsedTitle === this.video.getFileSafeTitle());
  public scale = 1.5;
}

export default class TorrentRanker {
  private static AUTO_REJECT = [
    "HDCAM", "CAMRip", "CAM", "TS", "TELESYNC", "PDVD",
    "HD-?TS", "HD-?TC", "WP", "WORKPRINT", "HC", "SUB",
    "SUBS", "KORSUB", "KOR", "TS-?RIP"
  ];

  private priorities: ResourcePriority<any>[] = [];

  constructor(public video: IVideo) {
    this.priorities = [
      new ResolutionPriority(this.video),
      new SeederPriority(this.video),
      new SizePriority(this.video),
      new TitlePriority(this.video),
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

  // Gives a star rating from 1-4
  public getStars(t: PartialTorrent): 1|2|3|4 {
    const maxRating = util.sum(this.priorities.map(p => p.scale));
    const maxStars = 4;
    const frac = this.getScore(t) / maxRating;
    return Math.min(Math.ceil(frac * maxStars), 1) as 1|2|3|4;
  }
}
