export default abstract class Base {
  public static schedule: JobSchedule = 'once';
  public static initDelayS: number = 0;

  constructor() {}

  // Result represents success value - should stop repeated execution on success
  public static run(videoId: number): Promise<boolean> {
    throw new Error('Not implemented');
  }
}
