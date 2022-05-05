import range = require('lodash/range');
import {filterEpisodes, getVideo} from './media';
import MediaSearch from '../apis/MediaSearch';
import {execCapture, removePrefix} from './util';
import * as logger from './logger';

interface RequireOptions {
  forceEpisodes?: EpisodesDescriptor; // Forces the episode mediaQuery argument to be as given.
  requireVideo?: boolean; // Indicates whether prompts should be given to reduce to a single video.
}

// Decorator to attach mediaQuery to the command function converation arg passed in.
export function requireMediaQuery(target: any, name: string, descriptor: PropertyDescriptor) {
  createDecorator(target, descriptor, async (convo) => addMediaQuery(convo));
}

// Decorator to attach mediaQuery for a single video to the command function converation arg passed in.
export function requireVideoQuery(target: any, name: string, descriptor: PropertyDescriptor) {
  createDecorator(target, descriptor, async (convo) => addMediaQuery(convo, {requireVideo: true}));
}

// Decorator to attach media to the command function converation arg passed in.
export function requireMedia(target: any, name: string, descriptor: PropertyDescriptor) {
  createDecorator(target, descriptor, async (convo) => addMedia(convo));
}

export function requireFullMedia(target: any, name: string, descriptor: PropertyDescriptor) {
  createDecorator(target, descriptor, async (convo) => addMedia(convo, {forceEpisodes: 'all'}));
}

export function requireVideo(target: any, name: string, descriptor: PropertyDescriptor) {
  createDecorator(target, descriptor, async (convo) => addMedia(convo, {requireVideo: true}));
}

function createDecorator(
  target: any,
  descriptor: PropertyDescriptor,
  modifier: (convo: Conversation) => Promise<SwiperReply|void>
): void {
  // Saving a reference to the original method so we can call it after updating the conversation.
  const origFn = descriptor.value;
  descriptor.value = async function(convo: Conversation, ...args: any) {
    const reply = await modifier(convo);
    if (reply) {
      return reply;
    }
    return origFn.call(this, convo, ...args);
  };
}

// Adds a media content item to the conversation. Returns a string if Swiper requires
// more information from the user. Returns nothing on success.
async function addMedia(convo: Conversation, options: RequireOptions = {}): Promise<SwiperReply|void> {
  // If mediaQuery has not been found yet, find it.
  const reply = addMediaQuery(convo, options);
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
  if (!getVideo(convo.media!)) {
    mediaQuery.episodes = mediaQuery.episodes || getEpisodesIdentifier(convo.input || '');
    if (!mediaQuery.episodes && options.requireVideo) {
      return { data: `Specify episode:\nex: S03E02` };
    } else if (!mediaQuery.episodes) {
      return { data: `Specify episodes:\n ex: new | S1 | S03E02-06 | S02-04 | S04E06 & 7, S05E02` };
    } else if (options.requireVideo && !describesSingleEpisode(mediaQuery.episodes)) {
      mediaQuery.episodes = null;
      return { err: `A single episode must be specified:\nex: S03E02` };
    }
    // Need to parse season episode string.
    const show = convo.media as Show;
    show.episodes = filterEpisodes(show.episodes, mediaQuery.episodes);
  }
}

function addMediaQuery(convo: Conversation, options: RequireOptions = {}): SwiperReply|void {
  if (!convo.mediaQuery) {
    let input = convo.input || '';
    const titleFinder = /^([\w \'\"\-\:\,\&]+?)(?: (?:s(?:eason)? ?\d{1,2}.*)|(?:\d{4}\b.*))?$/gi;
    const yearFinder = /\b(\d{4})\b/gi;
    const splitStr = input.split(' ');
    const keyword = splitStr[0];
    let type: MediaQuery["type"] = null;
    if (keyword === 'tv' || keyword === 'movie') {
      // If the type was included, set it and remove it from the titleStr
      type = keyword;
      input = splitStr.slice(1).join(' ');
    }
    const [title] = execCapture(input, titleFinder);
    if (!title) {
      return { err: `Can't parse content` };
    }
    let rem = removePrefix(input, title);
    const [year] = execCapture(rem, yearFinder);
    rem = removePrefix(rem, year || '');

    const seasonEpisodeStr = rem.trim();
    // If the seasonEpisode string was included and the type is still unknown, set it to 'tv'.
    type = type || (seasonEpisodeStr.length > 0 ? 'tv' : null);

    let episodes: EpisodesDescriptor|null = null;

    // If episodes was added as an optional argument, prioritize it.
    if (options.forceEpisodes) {
      episodes = options.forceEpisodes;
    } else if (seasonEpisodeStr.length > 0) {
      episodes = getEpisodesIdentifier(rem);
    }

    // If the type is tv and a video is required, send a prompt to get a single episode
    if (type === 'tv' && options.requireVideo) {
      if (!episodes) {
        return { data: `Specify episode:\nex: S03E02` };
      } else if (!describesSingleEpisode(episodes)) {
        return { err: `A single episode must be specified:\nex: S03E02` };
      }
    }

    convo.mediaQuery = {title, type, episodes, year};
    convo.input = '';
  }
}

// Indicates whether the EpisodesDescriptor describes a single episode.
function describesSingleEpisode(episodes: EpisodesDescriptor): boolean {
  if (episodes === 'new' || episodes === 'all') {
    return false;
  }
  const seasons = Object.keys(episodes);
  if (seasons.length !== 1) {
    return false;
  }
  return episodes[seasons[0]] !== 'all' && episodes[seasons[0]].length === 1;
}

// Takes a human-entered input of seasons and episodes of the following form:
//       'S01E01-04 & E06-E08, S03-S05, S06E02&6, S07 & S08'
// Returns a SeasonEpisodes object.
function getEpisodesIdentifier(input: string): SeasonEpisodes|'new'|null {
  const numberStr = input.replace('season', 's').replace('episode', 'e');
  if (input === 'new') {
    return input;
  } else if (!input || input.match(/[^es\d\s-,&]/gi)) {
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
