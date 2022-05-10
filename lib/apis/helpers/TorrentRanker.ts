import ResourcePriority from './ResourcePriority';
import * as mediaUtil from '../../common/media';
import * as util from '../../common/util';

class ResolutionPriority extends ResourcePriority<string> {
  public ranks = ['1080p', '720p'];
  public predicate = (v: string, t: TorrentResult) => t.resolution === v;
  public scale = 1;
}

class SeederPriority extends ResourcePriority<number> {
  public ranks = [30, 25, 20, 16, 12, 8, 4, 0];
  public predicate = (v: number, t: TorrentResult) => t.seeders >= v;
  public scale = 3.5;
}

class SizePriority extends ResourcePriority<[number, number]> {
  public ranks: [number, number][] = [[1200, 4000], [1000, 5000], [800, 8000], [200, 10000]];
  public predicate = (v: [number, number], t: TorrentResult) =>
      t.sizeMb >= v[0] && t.sizeMb <= v[1];
  public scale = 1.5;
}

class TitlePriority extends ResourcePriority<boolean> {
  public ranks = [true, false];
  public predicate = (v: boolean, t: TorrentResult) =>
    v === (t.parsedTitle === mediaUtil.getFileSafeTitle(this.video));
  public scale = 1.5;
}

export default class TorrentRanker {
  private static AUTO_REJECT = [
    "HDCAM", "CAMRip", "CAM", "TS", "TELESYNC", "PDVD",
    "HD-?TS", "HD-?TC", "WP", "WORKPRINT", "HC", "SUB",
    "SUBS", "KORSUB", "KOR", "TS-?RIP"
  ];

  constructor(public video: Video) {}

  public getScore(t: TorrentResult) {
    const rejected = TorrentRanker.AUTO_REJECT.find(r =>
      t.title.match(new RegExp(`\\b${r}\\b`, 'gi')));

    if (rejected) {
      return 0;
    }

    const scores = [
      new ResolutionPriority(this.video).getScore(t),
      new SeederPriority(this.video).getScore(t),
      new SizePriority(this.video).getScore(t),
      new TitlePriority(this.video).getScore(t),
    ];
    console.warn('TORRENT', t);
    console.warn('SCORES', scores);

    if (scores.some(x => x === -1)) {
      return 0;
    }

    return util.sum(scores);
  }
}
