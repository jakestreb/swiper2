export default abstract class Base<Row, Result> {
  constructor(public db: any) {}

  public abstract init(): Promise<this>;

  public abstract buildInstance(row: Row): Promise<Result>|Result;

  public async all(sql: string, params: any[] = []): Promise<Result[]> {
    const rows = await this.db.all(sql, params);
    return rows.map((r: any) => this.buildInstance(r));
  }

  public async get(sql: string, params: any[] = []): Promise<Result|void> {
    const row = await this.db.get(sql, params);
    if (row) {
      return this.buildInstance(row);
    }
  }

  public async run(sql: string, params: any[] = []): Promise<void> {
    return this.db.run(sql, params);
  }
}
