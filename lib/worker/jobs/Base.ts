import Swiper from '../../Swiper.js';
import Worker from '../';

export default class Base {
  public static schedule: JobSchedule = 'once';
  public static initDelayS: number = 0;

  constructor(public worker: Worker, public swiper: Swiper) {

  }

  // Should reschedule on failure / stop repeated execution on success
  public run(videoId: number, runCount: number): Promise<boolean> {
    throw new Error('Not implemented');
  }
}
