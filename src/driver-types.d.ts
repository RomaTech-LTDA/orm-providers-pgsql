declare module 'pg' {
  export interface QueryResult {
    rows: any[];
    fields: Array<{ name: string; dataTypeID: number }>;
  }

  export class Client {
    constructor(config?: any);
    connect(): Promise<void>;
    end(): Promise<void>;
    query(sql: string, params?: any[]): Promise<QueryResult>;
  }
}
