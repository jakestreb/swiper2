import MediaSearch from '../../apis/MediaSearch';
import {execCapture, removePrefix} from '../../common/util';
import * as logger from '../../common/logger';
import TextFormatter from '../../io/formatters/TextFormatter';
import EpisodeParser from './EpisodeParser';

interface ParserOptions {
  forceEpisodes?: EpisodesDescriptor;
  requireVideo?: boolean;
}

export default class MediaParser {
  constructor(public options: ParserOptions = {}) {}

  // Adds a media content item to the conversation. Returns a string if Swiper requires
  // more information from the user. Returns nothing on success.
  public async addMedia(convo: Conversation, f: TextFormatter): Promise<SwiperReply|void> {
    // If mediaQuery has not been found yet, find it.
    const reply = this.addMediaQuery(convo, f);
    if (reply) {
      return reply;
    }

    const mediaQuery = convo.mediaQuery as MediaQuery;

    // If media has not been found yet, find it.
    if (!convo.media) {
      try {
        convo.media = await MediaSearch.search(mediaQuery);
        convo.input = ''; // Clear the input since it has already been used.
      } catch (err) {
        logger.error(`Media lookup failed: ${err}`);
        return {
          err: 'Media lookup failed',
          final: true
        };
      }
    }

    // If the media isn't a single video and the episodes weren't specified, ask about them.
    if (!convo.media!.getVideo()) {
      mediaQuery.episodes = mediaQuery.episodes || EpisodeParser.parse(convo.input || '');
      if (!mediaQuery.episodes && this.options.requireVideo) {
        return {
          data: formatSpecifyEpisode(f),
        };
      } else if (!mediaQuery.episodes) {
        // TODO: Allow latest/unaired values
        return {
          data: formatSpecifyMultiple(f),
        };
      } else if (this.options.requireVideo && !EpisodeParser.describesOne(mediaQuery.episodes)) {
        mediaQuery.episodes = null;
        return {
          err: formatSpecifyEpisode(f),
        };
      }
      // Need to parse season episode string.
      const show = convo.media as IShow;
      show.filterEpisodes(mediaQuery.episodes);
    }
  }

  public async addMediaQuery(convo: Conversation, f: TextFormatter): Promise<SwiperReply|void> {
    if (!convo.mediaQuery) {
      let input = convo.input || '';
      const titleFinder = /^([\w \'\"\-\:\,\&]+?)(?: (?:s(?:eason)? ?\d{1,2}.*)|(?:\d{4}\b.*))?$/gi;
      const yearFinder = /\b(\d{4})\b/gi;
      const splitStr = input.split(' ');
      const keyword = splitStr[0];
      let type: MediaQuery["type"] = null;
      if (keyword === 'tv' || keyword === 'movie' || keyword === 'torrent') {
        // If the type was included, set it and remove it from the titleStr
        type = keyword;
        input = splitStr.slice(1).join(' ');
      }
      const [title] = execCapture(input, titleFinder);
      if (!title) {
        return { err: 'Unable to parse content' };
      }
      let rem = removePrefix(input, title);
      const [year] = execCapture(rem, yearFinder);
      rem = removePrefix(rem, year || '');

      const seasonEpisodeStr = rem.trim();
      // If the seasonEpisode string was included and the type is still unknown, set it to 'tv'.
      type = type || (seasonEpisodeStr.length > 0 ? 'tv' : null);

      let episodes: EpisodesDescriptor|null = null;

      // If episodes was added as an optional argument, prioritize it.
      if (this.options.forceEpisodes) {
        episodes = this.options.forceEpisodes;
      } else if (seasonEpisodeStr.length > 0) {
        episodes = EpisodeParser.parse(rem);
      }

      // If the type is tv and a video is required, send a prompt to get a single episode
      if (type === 'tv' && this.options.requireVideo) {
        if (!episodes || !EpisodeParser.describesOne(episodes)) {
          return {
            data: formatSpecifyEpisode(f),
          };
        }
      }

      convo.mediaQuery = {title, type, episodes, year};
      convo.input = '';
    }
  }
}

function formatSpecifyEpisode(f: TextFormatter) {
  return ['Specify episode, e.g.', f.commands('latest episode', 's1 e2')].join('\n\n');
}

function formatSpecifyMultiple(f: TextFormatter) {
  return ['Specify episodes, e.g.',
    f.commands(
      'latest season',
      'latest episode',
      'upcoming',
      's1',
      's1 e2',
      's1 e2-4'
    ),
  ].join('\n\n');
}
