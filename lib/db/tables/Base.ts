export default abstract class Base {
  constructor(public db: any) {}

  public abstract init(): Promise<this>;
}
