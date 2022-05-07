import Swiper from '../../Swiper';
import Worker from '../';

export default class Base {
  public static schedule: JobSchedule = 'once';
  public static initDelayS: number = 0;

  constructor(public worker: Worker, public swiper: Swiper) {

  }

  // Result represents success value - should stop repeated execution on success
  public run(videoId: number, runCount: number): Promise<boolean> {
    throw new Error('Not implemented');
  }
}
