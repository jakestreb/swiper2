
interface DB<Row> {
  [table: string]: any;

  all(sql: string, params: any[]): Promise<Row[]>;
  get(sql: string, params: any[]): Promise<Row>;
  run(sql: string, params: any[]): Promise<void>;
}

export default abstract class Base<Row, Result> {
  constructor(public db: DB<Row>) {}

  public abstract init(): Promise<this>;

  public abstract buildInstance(row: Row): Promise<Result>|Result;

  public async all(sql: string, params: any[] = []): Promise<Result[]> {
    const rows = await this.db.all(sql, params);
    return Promise.all(rows.map((r: Row) => this.buildInstance(r)));
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
