import DateParser from './helpers/DateParser';

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const oneDay = 24 * 60 * 60 * 1000;

export function parseDate(s: string): Date|null {
  return DateParser.parse(s);
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

export function getMonthRange(from: Date, to: Date): string {
  return `${months[from.getMonth()]} - ${months[to.getMonth()]} ${to.getFullYear()}`;
}

// Format wait time
export function formatWaitTime(date: Date): string {
  const s = (date.getTime() - new Date().getTime()) / 1000;
  const h = s / 60 / 60;
  if (s < 60) {
    return `${Math.max(s, 1)}s`;
  } else if (s < 60 * 60) {
    return `${s / 60}m`;
  } else if (s < 60 * 60 * 48) {
    return `${h}h ${s % (60 * 60)}m`;
  }
  return `${h / 24}d`;
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
    return `Last ${month} ${calDay}, ${year}`;
  } else if (diff < -oneWeek) {
    // Over a week ago
    return `Last ${weekday}, ${month} ${calDay}`;
  } else if (diff < -oneDay) {
    // In the week
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
    return `${weekday}, ${month} ${calDay}`;
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
