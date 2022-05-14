import * as mediaUtil from '../common/media';
import * as util from '../common/util';
import Swiper from '../Swiper';
import TextFormatter from '../io/formatters/TextFormatter';

const FULL = '\u25A0';
const HALF = '\u25A4';
const EMPTY = '\u25A1';

const NEXT = '(next)';

export async function info(this: Swiper, convo: Conversation, f: TextFormatter): Promise<SwiperReply> {
  const media = convo.media as Media;

  let data;
  if (media.type === 'movie') {
    data = formatMovie(media as Movie, f);
  } else {
    data = formatShow(media as Show, f);
  }

  return {
    data,
    final: true,
  };
}

function formatMovie(movie: Movie, f: TextFormatter) {
  const { title, theatricalRelease, streamingRelease } = movie;
  const theatrical = theatricalRelease && new Date(theatricalRelease);
  const streaming = streamingRelease && new Date(streamingRelease);

  // TODO: Add expected date
  return [
    f.u(title),
    theatrical ? [f.b('Theatrical'), f.i(util.getAiredStr(theatrical))].join(' ') : '',
    streaming ? [f.b('Streaming'), f.i(util.getAiredStr(streaming))].join(' ') : '',
  ]
  .filter(x => x)
  .join('\n');
}

function formatShow(show: Show, f: TextFormatter) {
  const { episodes } = show;

  const episodesBySeason: { [seasonNum: number]: Episode[] } = {};
  episodes.forEach((e, i) => {
    const current = episodesBySeason[e.seasonNum] || [];
    episodesBySeason[e.seasonNum] = [...current, e];
  });

  const unaired = mediaUtil.getNextToAir(show.episodes);
  let details: Episode[] = [];
  if (unaired) {
    const index = show.episodes.findIndex(e => e.id === unaired.id);
    const startIndex = Math.max(index - 1, 0);
    details = episodes.slice(startIndex, startIndex + 2);
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

function formatSeasonRow(first: Episode, last: Episode, f: TextFormatter) {
  const items = [
    f.b(`S${last.seasonNum}`),
    getSeasonIcon(first, last),
    `(E${first.episodeNum}-${last.episodeNum})`
  ];
  if (first.airDate && last.airDate) {
    items.push(util.getMonthRange(new Date(first.airDate), new Date(last.airDate)));
  }
  return items.join(' ');
}

function formatEpisodeRows(episodes: Episode[], f: TextFormatter): string {
  const nextToAir = mediaUtil.getNextToAir(episodes);
  return episodes
    .map(e => {
      const items = [f.sp(3), getEpisodeIcon(e), `E${e.episodeNum}`];
      if (e.airDate) {
        items.push(util.getAiredStr(new Date(e.airDate)))
      }
      if (nextToAir && nextToAir.id === e.id) {
        items.push(f.i(NEXT));
      }
      return items.join('');
    })
    .join('\n');
}

function getSeasonIcon(first: Episode, last: Episode) {
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

function getEpisodeIcon(e: Episode) {
  return e.airDate && new Date(e.airDate) <= new Date() ? EMPTY : FULL;
}
