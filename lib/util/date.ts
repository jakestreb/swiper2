import DateParser from './helpers/DateParser.js';

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ranges = [
  { name: 'Early', start: 1, end: 10 },
  { name: 'Mid', start: 11, end: 21 },
  { name: 'Late', start: 22, end: 31 },
];
const oneDay = 24 * 60 * 60 * 1000;

export function parseDate(s: string|null): Date|null {
  return s ? DateParser.parse(s) : null;
}

export function getNextToAir(episodes: IEpisode[]): IEpisode|null {
  const morning = getMorning();
  return episodes.find(ep => ep.airDate && (new Date(ep.airDate) >= morning)) || null;
}

export function getLastAired(episodes: IEpisode[]): IEpisode|null {
  const morning = getMorning();
  return episodes.slice().reverse().find(ep => ep.airDate && (new Date(ep.airDate) < morning)) || null;
}

// Returns a Date representing 12AM of the local timezone day in UTC.
export function getMorning(): Date {
  const offset = (new Date()).getTimezoneOffset();
  const now = Date.now();
  const nowTz = now - (offset * 60 * 1000);
  const morn = new Date(nowTz);
  morn.setUTCHours(0);
  morn.setUTCMinutes(0);
  morn.setUTCSeconds(0, 0);
  return morn;
}

export function getMonthAndYear(date: Date): string {
  return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

export function getApproximateDate(estimate: Date): string {
  const getRange = (date: Date) => {
    for (const range of ranges) {
      const dateOfMonth = date.getDate();
      if (dateOfMonth >= range.start && dateOfMonth <= range.end) {
        return range.name;
      }
    }
  };
  return `${getRange(estimate)} ${months[estimate.getMonth()]}`;
}

// Format wait time
export function formatWaitTime(date: Date): string {
  const s = (date.getTime() - new Date().getTime()) / 1000;
  const h = s / 60 / 60;
  if (s < 60) {
    const n = Math.ceil(Math.max(s, 1));
    return `${n}s`;
  } else if (s < 60 * 60) {
    const n = Math.floor(s / 60);
    return `${n}m`;
  } else if (s < 60 * 60 * 48) {
    const nh = Math.floor(h);
    const ns = s % (60 * 60);
    const nm = Math.floor(ns / 60);
    return `${nh}h ${nm}m`;
  }
  const n = Math.floor(h / 24);
  return `${n}d`;
}

export function formatDateSimple(date: Date): string {
  const month = months[date.getMonth()];
  const calDay = date.getDate();
  const diff = date.getTime() - getMorning().getTime();
  const year = date.getFullYear();
  if (diff > 0 && diff < oneDay) {
    return 'Today';
  }
  if (year === new Date().getFullYear()) {
    return `${month} ${calDay}`;
  }
  return `${month} ${calDay} ${year}`;
}

export function getAiredStr(date: Date): string {
  const oneWeek = 7 * oneDay;
  const sixMonths = 182 * oneDay;
  const weekday = weekdays[date.getDay()];
  const month = months[date.getMonth()];
  const calDay = date.getDate();
  const year = date.getFullYear();
  const diff = date.getTime() - getMorning().getTime();
  if (diff < -sixMonths) {
    return `${month} ${calDay}, ${year}`;
  } else if (diff < -oneWeek) {
    // Over a week ago
    return `${month} ${calDay}`;
  } else if (diff < -oneDay) {
    // In the past week
    return `Last ${weekday}`;
  } else if (diff < 0) {
    return `Yesterday`;
  } else if (diff < oneDay) {
    return `Today ${getTimeString(date)}`;
  } else if (diff < oneWeek) {
    // In the next week
    return `${weekday} ${getTimeString(date)}`;
  } else if (diff < sixMonths) {
    // More than a week ahead
    return `${month} ${calDay}`;
  } else {
    // More than 6 months ahead
    return `${month} ${calDay}, ${year}`;
  }
}

function getTimeString(date: Date): string {
  const hours = date.getHours();
  const minutes = `0${date.getMinutes()}`.slice(-2);
  const minutesStr = minutes === '00' ? '' : `:${minutes}`;
  const ampm = hours < 12 ? 'a' : 'p';
  return `${hours % 12 || 12}${minutesStr}${ampm}`;
}
