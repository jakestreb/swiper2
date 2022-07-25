import Swiper from '../Swiper';
import * as util from '../util';

const FULL = '\u25A0';
const HALF = '\u25A4';
const EMPTY = '\u25A1';

const NEXT = '(next)';

// How long to show the expected date after a video is expected
const SHOW_EXPECTED_FOR_DAYS = 120;

export async function info(this: Swiper, convo: Conversation): Promise<SwiperReply> {
  const f = this.getTextFormatter(convo);
  const media = convo.media as IMedia;

  let data;
  if (media.type === 'movie') {
    data = formatMovie(media as IMovie, f);
  } else {
    data = formatShow(media as IShow, f);
  }

  return {
    data,
    final: true,
  };
}

function formatMovie(movie: IMovie, f: TextFormatter) {
  const { title, releases } = movie;
  const theatrical = releases.theatrical && new Date(releases.theatrical);
  const digital = releases.digital && new Date(releases.digital);
  const expected = movie.getExpectedRelease();

  let isRecent = false;
  if (expected) {
    const recency = new Date(expected.getTime());
    recency.setDate(expected.getDate() + SHOW_EXPECTED_FOR_DAYS);
    isRecent = new Date() <= recency;
  }

  return [
    f.u(title),
    formatMovieDate('Theatrical', theatrical || null, f),
    formatMovieDate('Streaming', digital || null, f),
    formatMovieDate('Expected', isRecent ? movie.getExpectedRelease() : null, f),
  ]
  .filter(x => x)
  .join('\n');
}

function formatShow(show: IShow, f: TextFormatter) {
  const { episodes } = show;

  const episodesBySeason: { [seasonNum: number]: IEpisode[] } = {};
  episodes.forEach(e => {
    const current = episodesBySeason[e.seasonNum] || [];
    episodesBySeason[e.seasonNum] = [...current, e];
  });

  const unaired = util.getNextToAir(show.episodes);
  let details: IEpisode[] = [];
  if (unaired) {
    const seasonEpisodes = episodesBySeason[unaired.seasonNum];
    const index = seasonEpisodes.findIndex(e => e.id === unaired.id);
    const startIndex = Math.max(index - 1, 0);
    details = seasonEpisodes.slice(startIndex, startIndex + 2);
  }

  const contentRows = Object.keys(episodesBySeason)
    .map(seasonNum => {
      const isPartialSeason = details.length > 0 && `${details[0].seasonNum}` === seasonNum;
      const seasonEpisodes = episodesBySeason[Number(seasonNum)];
      const first = seasonEpisodes[0];
      const last = seasonEpisodes[seasonEpisodes.length - 1];
      const rows = [formatSeasonRow(first, last, f)];
      if (isPartialSeason) {
        rows.push(formatEpisodeRows(details, f));
      }
      return rows.join('\n');
    });

  return [f.u(show.title), ...contentRows].join('\n');
}

function formatSeasonRow(first: IEpisode, last: IEpisode, f: TextFormatter) {
  const items = [
    getSeasonIcon(first, last),
    f.b(`S${last.seasonNum}`),
    `(E${first.episodeNum}-${last.episodeNum})`
  ];
  if (first.airDate && last.airDate) {
    items.push(util.getMonthRange(new Date(first.airDate), new Date(last.airDate)));
  }
  return items.join(' ');
}

function formatEpisodeRows(episodes: IEpisode[], f: TextFormatter): string {
  const nextToAir = util.getNextToAir(episodes);
  return episodes
    .map(e => {
      const items = [getDateIcon(e.airDate), `E${e.episodeNum}`];
      if (e.airDate) {
        items.push(util.getAiredStr(new Date(e.airDate)))
      }
      if (nextToAir && nextToAir.id === e.id) {
        items.push(f.i(NEXT));
      }
      return f.sp(2) + items.join(' ');
    })
    .join('\n');
}

function formatMovieDate(dateName: string, date: Date|null, f: TextFormatter): string {
  if (!date) {
    return '';
  }
  return [
    getDateIcon(date),
    f.b(dateName),
    f.i(util.getAiredStr(date))
  ].join(' ');
}

function getSeasonIcon(first: IEpisode, last: IEpisode) {
  if (!first.airDate || !last.airDate) {
    return FULL;
  }
  const now = new Date();
  const firstDate = new Date(first.airDate);
  const lastDate = new Date(last.airDate);
  if (now < firstDate) {
    return EMPTY;
  } else if (now > lastDate) {
    return FULL;
  } else {
    return HALF;
  }
}

function getDateIcon(date?: Date) {
  return date && new Date() > date ? FULL : EMPTY;
}
