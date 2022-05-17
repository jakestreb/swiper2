export default abstract class Base<T> {
  constructor(public db: any) {}

  public abstract init(): Promise<this>;

  public abstract buildInstance(row: any): Promise<T>|T;

  public async all(sql: string, params: any[] = []): Promise<T[]> {
    const rows = await this.db.all(sql, params);
    return rows.map((r: any) => this.buildInstance(r));
  }

  public async get(sql: string, params: any[] = []): Promise<T|void> {
    const all = await this.db.get(sql, params);
    if (all.length > 0) {
      return this.buildInstance(all[0]);
    }
  }

  public async run(sql: string, params: any[] = []): Promise<void> {
    return this.db.run(sql, params);
  }
}
