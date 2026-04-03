import { EventEmitter } from 'events';

declare class Cursor<T = Record<string, any>> {
  limit(limit: number | null): this;
  sort(sortQuery: Record<string, number>): this;
  exec(callback: (err: Error | null, docs: T[]) => void): void;
}

declare class Persistence<T = Record<string, any>> {
  compactDatafile(): void;
  setAutocompactionInterval(interval: number): void;
  stopAutocompaction(): void;
  persistCachedDatabase(callback?: (err: Error | null) => void): void;
  persistNewState(newDocs: Array<T | { $$deleted: true; _id: string }>, callback?: (err: Error | null) => void): void;
  loadDatabase(callback?: (err: Error | null) => void): void;
}

declare class Datastore<T = Record<string, any>> extends EventEmitter {
  constructor(options?: string | Datastore.DataStoreOptions);
  autoload: boolean;
  compareStrings?: (a: string, b: string) => number;
  filename: string | null;
  inMemoryOnly: boolean;
  persistence: Persistence<T>;
  count(query: any, callback: (err: Error | null, count: number) => void): void;
  find(query?: any): Cursor<T>;
  find(query: any, callback: (err: Error | null, docs: T[]) => void): void;
  insert(doc: T, callback: (err: Error | null, newDoc: T) => void): void;
  loadDatabase(callback?: (err: Error | null) => void): void;
  remove(query: any): void;
  remove(query: any, callback: (err: Error | null, numRemoved: number) => void): void;
  remove(query: any, options: Datastore.RemoveOptions, callback?: (err: Error | null, numRemoved: number) => void): void;
  update(query: any, updateQuery: T): void;
  update(query: any, updateQuery: T, callback: Datastore.UpdateCallback<T>): void;
  update(query: any, updateQuery: T, options: Datastore.UpdateOptions, callback?: Datastore.UpdateCallback<T>): void;

  static Cursor: typeof Cursor;
  static Persistence: typeof Persistence;
}

declare namespace Datastore {
  interface DataStoreOptions {
    afterSerialization?: (value: string) => string;
    autoload?: boolean;
    beforeDeserialization?: (value: string) => string;
    compareStrings?: (a: string, b: string) => number;
    corruptAlertThreshold?: number;
    filename?: string;
    inMemoryOnly?: boolean;
    onload?: (err: Error | null) => void;
  }

  interface RemoveOptions {
    multi?: boolean;
  }

  interface UpdateOptions {
    multi?: boolean;
    returnUpdatedDocs?: boolean;
    upsert?: boolean;
  }

  type UpdateCallback<T> = (
    err: Error | null,
    numAffected: number,
    affectedDocuments?: T | T[] | null,
    upsert?: boolean,
  ) => void;
}

export = Datastore;
