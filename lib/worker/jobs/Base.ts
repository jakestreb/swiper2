export default abstract class Base {
  constructor() {}

  // Result represents success value - should stop repeated execution on success
  public abstract run(videoId: number): Promise<boolean>;
}
