/* eslint-disable prefer-rest-params -- preserve NeDB-style callback forwarding */
import { randomBytes } from 'crypto';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';

interface DeletedDoc {
  $$deleted: true;
  _id: string;
}

type GenericDocument = Record<string, any> & { _id?: string };
type SerializableDoc = GenericDocument | DeletedDoc;
type CompareStrings = (a: string, b: string) => number;
type Query = Record<string, any>;
type QueryValue = string | Query | null | undefined;
type GenericCallback = (...args: any[]) => void;
type CountCallback = (err: Error | null, count: number) => void;
type FindCallback<T> = (err: Error | null, docs: T[]) => void;

type CursorExecFn<T> = (
  err: Error | null,
  docs: T[],
  callback: GenericCallback,
) => void;

type InternalUpdateCallback<T> = (
  err: Error | null,
  numAffected: number,
  affectedDocuments?: T | T[] | null,
  upsert?: boolean,
) => void;

interface InternalTask {
  arguments: IArguments | unknown[];
  fn: (...args: any[]) => void;
  this: unknown;
}

interface InternalUpdateOptions {
  multi?: boolean;
  returnUpdatedDocs?: boolean;
  upsert?: boolean;
}

interface InternalRemoveOptions {
  multi?: boolean;
}

interface InternalDataStoreOptions {
  afterSerialization?: (value: string) => string;
  autoload?: boolean;
  beforeDeserialization?: (value: string) => string;
  compareStrings?: CompareStrings;
  corruptAlertThreshold?: number;
  filename?: string;
  inMemoryOnly?: boolean;
  onload?: (err: Error | null) => void;
}

function isDate(value: unknown): value is Date {
  return value instanceof Date || (!!value && typeof (value as Date).getTime === 'function');
}

function checkKey(key: string | number, value: unknown) {
  const normalizedKey = typeof key === 'number' ? key.toString() : key;

  if (
    normalizedKey[0] === '$' &&
    !(normalizedKey === '$$date' && typeof value === 'number') &&
    !(normalizedKey === '$$deleted' && value === true)
  ) {
    throw new Error('Field names cannot begin with the $ character');
  }

  if (normalizedKey.includes('.')) {
    throw new Error('Field names cannot contain a .');
  }
}

function checkObject(obj: unknown) {
  if (Array.isArray(obj)) {
    obj.forEach(checkObject);
  }

  if (obj && typeof obj === 'object') {
    Object.keys(obj).forEach(key => {
      checkKey(key, (obj as Record<string, unknown>)[key]);
      checkObject((obj as Record<string, unknown>)[key]);
    });
  }
}

function serialize(obj: SerializableDoc) {
  return JSON.stringify(obj, function(this: Record<string, unknown>, key, value) {
    checkKey(key, value);

    if (value === undefined) {
      return undefined;
    }

    if (value === null) {
      return null;
    }

    const currentValue = this[key];
    if (isDate(currentValue)) {
      return { $$date: currentValue.getTime() };
    }

    return value;
  });
}

function deserialize(rawData: string) {
  return JSON.parse(rawData, (_key, value) => {
    if (value && typeof value === 'object' && value.$$date !== undefined) {
      return new Date(value.$$date);
    }

    return value;
  }) as SerializableDoc;
}

function deepCopy<T>(obj: T, strictKeys = false): T {
  if (
    typeof obj === 'boolean' ||
    typeof obj === 'number' ||
    typeof obj === 'string' ||
    obj === null ||
    isDate(obj)
  ) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => deepCopy(item, strictKeys)) as T;
  }

  if (obj && typeof obj === 'object') {
    return Object.keys(obj as Record<string, unknown>).reduce<Record<string, unknown>>((acc, key) => {
      if (!strictKeys || (key[0] !== '$' && !key.includes('.'))) {
        acc[key] = deepCopy((obj as Record<string, unknown>)[key], strictKeys);
      }
      return acc;
    }, {}) as T;
  }

  return undefined as T;
}

function getDotValue(obj: unknown, field: string | string[]): unknown {
  const fieldParts = Array.isArray(field) ? field : `${field}`.split('.');

  if (!obj) {
    return undefined;
  }

  if (fieldParts.length === 0) {
    return obj;
  }

  if (fieldParts.length === 1) {
    return (obj as Record<string, unknown>)[fieldParts[0]];
  }

  const first = (obj as Record<string, unknown>)[fieldParts[0]];

  if (Array.isArray(first)) {
    const index = parseInt(fieldParts[1], 10);

    if (!Number.isNaN(index)) {
      return getDotValue(first[index], fieldParts.slice(2));
    }

    return first.map(item => getDotValue(item, fieldParts.slice(1)));
  }

  return getDotValue(first, fieldParts.slice(1));
}

function compareNSB(a: number | string | boolean, b: number | string | boolean) {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

function compareArrays(a: unknown[], b: unknown[], compareStrings: CompareStrings): number {
  const max = Math.min(a.length, b.length);
  for (let i = 0; i < max; i += 1) {
    const comparison: number = compareThings(a[i], b[i], compareStrings);
    if (comparison !== 0) {
      return comparison;
    }
  }

  return compareNSB(a.length, b.length);
}

function compareThings(a: unknown, b: unknown, compareStrings: CompareStrings = compareNSB): number {
  if (a === undefined) {
    return b === undefined ? 0 : -1;
  }
  if (b === undefined) {
    return 1;
  }

  if (a === null) {
    return b === null ? 0 : -1;
  }
  if (b === null) {
    return 1;
  }

  if (typeof a === 'number') {
    return typeof b === 'number' ? compareNSB(a, b) : -1;
  }
  if (typeof b === 'number') {
    return 1;
  }

  if (typeof a === 'string') {
    return typeof b === 'string' ? compareStrings(a, b) : -1;
  }
  if (typeof b === 'string') {
    return 1;
  }

  if (typeof a === 'boolean') {
    return typeof b === 'boolean' ? compareNSB(a, b) : -1;
  }
  if (typeof b === 'boolean') {
    return 1;
  }

  if (isDate(a)) {
    return isDate(b) ? compareNSB(a.getTime(), b.getTime()) : -1;
  }
  if (isDate(b)) {
    return 1;
  }

  if (Array.isArray(a)) {
    return Array.isArray(b) ? compareArrays(a, b, compareStrings) : -1;
  }
  if (Array.isArray(b)) {
    return 1;
  }

  const aKeys = Object.keys(a as Record<string, unknown>).sort();
  const bKeys = Object.keys(b as Record<string, unknown>).sort();
  const max = Math.min(aKeys.length, bKeys.length);

  for (let i = 0; i < max; i += 1) {
    const keyComparison = compareNSB(aKeys[i], bKeys[i]);
    if (keyComparison !== 0) {
      return keyComparison;
    }

    const comparison: number = compareThings(
      (a as Record<string, unknown>)[aKeys[i]],
      (b as Record<string, unknown>)[bKeys[i]],
      compareStrings,
    );
    if (comparison !== 0) {
      return comparison;
    }
  }

  return compareNSB(aKeys.length, bKeys.length);
}

function areThingsEqual(a: unknown, b: unknown): boolean {
  if (
    a === null ||
    typeof a === 'string' ||
    typeof a === 'boolean' ||
    typeof a === 'number' ||
    b === null ||
    typeof b === 'string' ||
    typeof b === 'boolean' ||
    typeof b === 'number'
  ) {
    return a === b;
  }

  if (isDate(a) || isDate(b)) {
    return isDate(a) && isDate(b) && a.getTime() === b.getTime();
  }

  if ((Array.isArray(a) || Array.isArray(b)) && !(Array.isArray(a) && Array.isArray(b))) {
    return false;
  }

  if (a === undefined || b === undefined) {
    return false;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }

    for (let i = 0; i < a.length; i += 1) {
      if (!areThingsEqual(a[i], b[i])) {
        return false;
      }
    }

    return true;
  }

  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') {
    return false;
  }

  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);

  if (aKeys.length !== bKeys.length) {
    return false;
  }

  for (const key of aKeys) {
    if (!bKeys.includes(key) || !areThingsEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
      return false;
    }
  }

  return true;
}

function areComparable(a: unknown, b: unknown) {
  const validA = typeof a === 'string' || typeof a === 'number' || isDate(a);
  const validB = typeof b === 'string' || typeof b === 'number' || isDate(b);

  if (!validA || !validB) {
    return false;
  }

  if (isDate(a) || isDate(b)) {
    return isDate(a) && isDate(b);
  }

  return typeof a === typeof b;
}

const comparisonFunctions: Record<string, (a: unknown, b: unknown) => boolean> = {
  $gt: (a, b) => areComparable(a, b) && (a as string | number | Date) > (b as string | number | Date),
  $in: (a, b) => {
    if (!Array.isArray(b)) {
      throw new Error('$in operator called with a non-array');
    }

    return b.some(item => areThingsEqual(a, item));
  },
  $nin: (a, b) => {
    if (!Array.isArray(b)) {
      throw new Error('$nin operator called with a non-array');
    }

    return !comparisonFunctions.$in(a, b);
  },
};

function matchQueryPart(
  obj: Record<string, unknown>,
  queryKey: string,
  queryValue: unknown,
  treatObjAsValue = false,
): boolean {
  const objValue = getDotValue(obj, queryKey);

  if (Array.isArray(objValue) && !treatObjAsValue) {
    if (Array.isArray(queryValue)) {
      return matchQueryPart(obj, queryKey, queryValue, true);
    }

    for (let i = 0; i < objValue.length; i += 1) {
      if (matchQueryPart({ value: objValue[i] }, 'value', queryValue)) {
        return true;
      }
    }

    return false;
  }

  if (
    queryValue &&
    typeof queryValue === 'object' &&
    !Array.isArray(queryValue) &&
    !isDate(queryValue) &&
    !(queryValue instanceof RegExp)
  ) {
    const keys = Object.keys(queryValue);
    const operatorKeys = keys.filter(key => key[0] === '$');

    if (operatorKeys.length > 0) {
      if (operatorKeys.length !== keys.length) {
        throw new Error('You cannot mix operators and normal fields');
      }

      for (const key of keys) {
        const fn = comparisonFunctions[key];
        if (!fn) {
          throw new Error(`Unknown comparison function ${key}`);
        }

        if (!fn(objValue, (queryValue as Record<string, unknown>)[key])) {
          return false;
        }
      }

      return true;
    }
  }

  if (queryValue instanceof RegExp) {
    return typeof objValue === 'string' && queryValue.test(objValue);
  }

  return areThingsEqual(objValue, queryValue);
}

function isPrimitiveType(value: unknown) {
  return (
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string' ||
    value === null ||
    isDate(value) ||
    Array.isArray(value)
  );
}

function match(obj: unknown, query: Query) {
  if (isPrimitiveType(obj) || isPrimitiveType(query)) {
    return matchQueryPart({ value: obj }, 'value', query);
  }

  for (const key of Object.keys(query)) {
    if (key[0] === '$') {
      throw new Error(`Unknown logical operator ${key}`);
    }

    if (!matchQueryPart(obj as Record<string, unknown>, key, query[key])) {
      return false;
    }
  }

  return true;
}

function callSoon(callback: GenericCallback, ...args: any[]) {
  if (typeof setImmediate === 'function') {
    setImmediate(() => callback(...args));
  } else {
    process.nextTick(() => callback(...args));
  }
}

class Executor {
  private buffer: InternalTask[] = [];
  private queue: InternalTask[] = [];
  private running = false;
  ready = false;

  push(task: InternalTask, forceQueuing = false) {
    if (this.ready || forceQueuing) {
      this.queue.push(task);
      this.drain();
    } else {
      this.buffer.push(task);
    }
  }

  processBuffer() {
    this.ready = true;
    this.queue.push(...this.buffer);
    this.buffer = [];
    this.drain();
  }

  private drain() {
    if (this.running) {
      return;
    }

    const task = this.queue.shift();
    if (!task) {
      return;
    }

    this.running = true;
    const args = Array.from(task.arguments);
    const lastArg = args[args.length - 1];
    const finish = () => {
      this.running = false;
      this.drain();
    };

    if (typeof lastArg === 'function') {
      args[args.length - 1] = (...callbackArgs: any[]) => {
        finish();
        (lastArg as GenericCallback)(...callbackArgs);
      };
    } else if (!lastArg && args.length !== 0) {
      args[args.length - 1] = () => {
        finish();
      };
    } else {
      args.push(() => {
        finish();
      });
    }

    try {
      task.fn.apply(task.this, args);
    } catch (err) {
      finish();
      if (typeof lastArg === 'function') {
        (lastArg as GenericCallback)(err);
        return;
      }

      throw err;
    }
  }
}

async function ensureDirectoryExists(dir: string) {
  await fs.promises.mkdir(dir, { recursive: true });
}

async function crashSafeWriteFile(filename: string, data: string) {
  const tempFilename = `${filename}~`;
  await fs.promises.writeFile(tempFilename, data, 'utf8');
  await fs.promises.rename(tempFilename, filename);
}

class Persistence<T extends GenericDocument = GenericDocument> {
  autocompactionIntervalId?: ReturnType<typeof setInterval>;
  readonly afterSerialization: (value: string) => string;
  readonly beforeDeserialization: (value: string) => string;
  readonly corruptAlertThreshold: number;
  readonly db: Datastore<T>;
  readonly filename: string | null;
  readonly inMemoryOnly: boolean;

  constructor(options: { db: Datastore<T> } & InternalDataStoreOptions) {
    this.db = options.db;
    this.inMemoryOnly = this.db.inMemoryOnly;
    this.filename = this.db.filename;
    this.corruptAlertThreshold =
      options.corruptAlertThreshold !== undefined ? options.corruptAlertThreshold : 0.1;
    this.afterSerialization = options.afterSerialization || (value => value);
    this.beforeDeserialization = options.beforeDeserialization || (value => value);

    if (!this.inMemoryOnly && this.filename && this.filename.endsWith('~')) {
      throw new Error("The datafile name can't end with a ~, which is reserved for crash safe backup files");
    }
  }

  compactDatafile() {
    this.db.executor.push({ this: this, fn: this.persistCachedDatabase, arguments: [] });
  }

  setAutocompactionInterval(interval: number) {
    const minInterval = 5000;
    const realInterval = Math.max(interval || 0, minInterval);

    this.stopAutocompaction();
    this.autocompactionIntervalId = setInterval(() => {
      this.compactDatafile();
    }, realInterval);
  }

  stopAutocompaction() {
    if (this.autocompactionIntervalId) {
      clearInterval(this.autocompactionIntervalId);
    }
  }

  persistCachedDatabase(cb: (err: Error | null) => void = () => {}) {
    if (this.inMemoryOnly || !this.filename) {
      callSoon(cb, null);
      return;
    }

    const docs = this.db.getAllData();
    const payload = docs
      .map(doc => this.afterSerialization(serialize(doc)))
      .join('\n');
    const data = payload ? `${payload}\n` : '';

    (async () => {
      await ensureDirectoryExists(path.dirname(this.filename as string));
      await crashSafeWriteFile(this.filename as string, data);
    })()
      .then(() => {
        this.db.emit('compaction.done');
        cb(null);
      })
      .catch((err: Error) => cb(err));
  }

  persistNewState(newDocs: SerializableDoc[], cb: (err: Error | null) => void = () => {}) {
    if (this.inMemoryOnly || !this.filename || newDocs.length === 0) {
      callSoon(cb, null);
      return;
    }

    const payload = newDocs
      .map(doc => this.afterSerialization(serialize(doc)))
      .join('\n');

    (async () => {
      await ensureDirectoryExists(path.dirname(this.filename as string));
      await fs.promises.appendFile(this.filename as string, `${payload}\n`, 'utf8');
    })()
      .then(() => cb(null))
      .catch((err: Error) => cb(err));
  }

  treatRawData(rawData: string): T[] {
    const data = rawData.split('\n');
    const dataById = new Map<string, T>();
    let corruptItems = -1;

    for (const item of data) {
      if (!item) {
        corruptItems += 1;
        continue;
      }

      try {
        const doc = deserialize(this.beforeDeserialization(item));
        if (doc && '_id' in doc) {
          if ('$$deleted' in doc && doc.$$deleted === true) {
            dataById.delete(doc._id as string);
          } else {
            dataById.set(doc._id as string, doc as T);
          }
        }
      } catch {
        corruptItems += 1;
      }
    }

    if (data.length > 0 && corruptItems / data.length > this.corruptAlertThreshold) {
      throw new Error(
        `More than ${Math.floor(
          100 * this.corruptAlertThreshold,
        )}% of the data file is corrupt, cautiously refusing to start NeDB to prevent data loss`,
      );
    }

    return Array.from(dataById.values());
  }

  loadDatabase(cb: (err: Error | null) => void = () => {}) {
    this.db.clearAllData();

    if (this.inMemoryOnly || !this.filename) {
      callSoon(() => {
        this.db.executor.processBuffer();
        cb(null);
      });
      return;
    }

    (async () => {
      await ensureDirectoryExists(path.dirname(this.filename as string));

      try {
        await fs.promises.access(this.filename as string);
      } catch {
        await fs.promises.writeFile(this.filename as string, '', 'utf8');
      }

      const rawData = await fs.promises.readFile(this.filename as string, 'utf8');
      const docs = this.treatRawData(rawData);
      this.db.resetData(docs);

      await new Promise<void>((resolve, reject) => {
        this.persistCachedDatabase(err => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    })()
      .then(() => {
        this.db.executor.processBuffer();
        cb(null);
      })
      .catch((err: Error) => cb(err));
  }
}

class Cursor<T extends GenericDocument = GenericDocument> {
  private _limit?: number | null;
  private _sort?: Record<string, number>;
  readonly db: Datastore<T>;
  readonly execFn?: CursorExecFn<T>;
  readonly query: Query;

  constructor(db: Datastore<T>, query?: QueryValue, execFn?: CursorExecFn<T>) {
    this.db = db;
    this.query = normalizeQuery(query);
    this.execFn = execFn;
  }

  limit(limit: number | null) {
    this._limit = limit;
    return this;
  }

  sort(sortQuery: Record<string, number>) {
    this._sort = sortQuery;
    return this;
  }

  _exec(callback: GenericCallback) {
    let results: T[] = [];

    try {
      results = this.db
        .getAllData()
        .filter(doc => match(doc, this.query));

      if (this._sort) {
        const criteria = Object.keys(this._sort).map(key => ({
          direction: this._sort![key],
          key,
        }));

        results.sort((a, b) => {
          for (const criterion of criteria) {
            const comparison =
              criterion.direction *
              compareThings(
                getDotValue(a, criterion.key),
                getDotValue(b, criterion.key),
                this.db.compareStrings,
              );

            if (comparison !== 0) {
              return comparison;
            }
          }

          return 0;
        });
      }

      if (typeof this._limit === 'number' && this._limit >= 0) {
        results = results.slice(0, this._limit);
      }

      results = results.map(doc => deepCopy(doc));
    } catch (err) {
      callback(err);
      return;
    }

    if (this.execFn) {
      this.execFn(null, results, callback);
    } else {
      callback(null, results);
    }
  }

  exec(callback: FindCallback<T>) {
    this.db.executor.push({ this: this, fn: this._exec, arguments }, false);
  }
}

function normalizeQuery(query?: QueryValue): Query {
  if (!query) {
    return {};
  }

  if (typeof query === 'string') {
    return { _id: query };
  }

  return query;
}

class Datastore<T extends GenericDocument = GenericDocument> extends EventEmitter {
  static Cursor = Cursor;
  static Persistence = Persistence;

  autoload: boolean;
  compareStrings: CompareStrings;
  executor: Executor;
  filename: string | null;
  inMemoryOnly: boolean;
  persistence: Persistence<T>;
  private docs: Map<string, T>;

  constructor(options: string | InternalDataStoreOptions = {}) {
    super();

    const normalizedOptions = typeof options === 'string' ? { filename: options } : options;

    this.inMemoryOnly = normalizedOptions.inMemoryOnly || !normalizedOptions.filename;
    this.autoload = normalizedOptions.autoload || false;
    this.filename = this.inMemoryOnly ? null : normalizedOptions.filename || null;
    this.compareStrings = normalizedOptions.compareStrings || compareNSB;
    this.persistence = new Persistence({
      afterSerialization: normalizedOptions.afterSerialization,
      beforeDeserialization: normalizedOptions.beforeDeserialization,
      corruptAlertThreshold: normalizedOptions.corruptAlertThreshold,
      db: this,
    });
    this.executor = new Executor();
    this.docs = new Map();

    if (this.inMemoryOnly) {
      this.executor.ready = true;
    }

    if (this.autoload) {
      this.loadDatabase(normalizedOptions.onload || (err => {
        if (err) {
          throw err;
        }
      }));
    }
  }

  loadDatabase(callback?: (err: Error | null) => void) {
    this.executor.push({ this: this.persistence, fn: this.persistence.loadDatabase, arguments }, true);
    if (!callback && arguments.length === 0) {
      return;
    }
  }

  getAllData() {
    return Array.from(this.docs.values());
  }

  resetData(docs: T[] = []) {
    this.docs = new Map(docs.map(doc => [doc._id as string, doc]));
  }

  clearAllData() {
    this.resetData();
  }

  createNewId() {
    let tentativeId = randomBytes(16).toString('hex');
    while (this.docs.has(tentativeId)) {
      tentativeId = randomBytes(16).toString('hex');
    }
    return tentativeId;
  }

  prepareDocumentForInsertion(newDoc: T) {
    const preparedDoc = deepCopy(newDoc);
    if (preparedDoc._id === undefined) {
      (preparedDoc as GenericDocument)._id = this.createNewId();
    }
    checkObject(preparedDoc);
    return preparedDoc;
  }

  _insert(newDoc: T, cb: (err: Error | null, newDoc?: T) => void = () => {}) {
    let preparedDoc: T;

    try {
      preparedDoc = this.prepareDocumentForInsertion(newDoc);
      this.docs.set(preparedDoc._id as string, preparedDoc);
    } catch (err) {
      cb(err as Error);
      return;
    }

    this.persistence.persistNewState([preparedDoc], err => {
      if (err) {
        cb(err);
        return;
      }

      cb(null, deepCopy(preparedDoc));
    });
  }

  insert(doc: T, callback?: (err: Error | null, newDoc: T) => void) {
    this.executor.push({ this: this, fn: this._insert, arguments }, false);
    if (!callback && arguments.length === 1) {
      return;
    }
  }

  count(query: QueryValue, callback: CountCallback): void;
  count(query: QueryValue): Cursor<T>;
  count(query: QueryValue, callback?: CountCallback) {
    const cursor = new Cursor(this, query, (err, docs, done) => {
      if (err) {
        done(err);
        return;
      }

      done(null, docs.length);
    });

    if (typeof callback === 'function') {
      cursor.exec(callback as unknown as FindCallback<T>);
      return;
    }

    return cursor;
  }

  find(query?: QueryValue): Cursor<T>;
  find(query: QueryValue, callback: FindCallback<T>): void;
  find(query: QueryValue, projection: unknown, callback: FindCallback<T>): void;
  find(query: QueryValue = {}, projection?: unknown | FindCallback<T>, callback?: FindCallback<T>) {
    if (typeof projection === 'function') {
      callback = projection as FindCallback<T>;
    }

    const cursor = new Cursor(this, query, (err, docs, done) => {
      if (err) {
        done(err);
        return;
      }

      done(null, docs.map(doc => deepCopy(doc)));
    });

    if (typeof callback === 'function') {
      cursor.exec(callback);
      return;
    }

    return cursor;
  }

  _update(
    query: QueryValue,
    updateQuery: T,
    options: InternalUpdateOptions | InternalUpdateCallback<T> = {},
    cb?: InternalUpdateCallback<T>,
  ) {
    const normalizedOptions = typeof options === 'function' ? {} : options;
    const callback = (typeof options === 'function' ? options : cb) || (() => {});
    const normalizedQuery = normalizeQuery(query);
    const multi = normalizedOptions.multi || false;
    const upsert = normalizedOptions.upsert || false;
    const modifications: { oldDoc: T; newDoc: T }[] = [];

    try {
      for (const doc of this.getAllData()) {
        if (match(doc, normalizedQuery) && (multi || modifications.length === 0)) {
          const updatedDoc = deepCopy(updateQuery);
          (updatedDoc as GenericDocument)._id = doc._id;
          checkObject(updatedDoc);
          modifications.push({ newDoc: updatedDoc, oldDoc: doc });
        }
      }
    } catch (err) {
      callback(err as Error, 0);
      return;
    }

    if (modifications.length === 0 && upsert) {
      this._insert(updateQuery, (err, newDoc) => {
        callback(err || null, err ? 0 : 1, newDoc || null, !err);
      });
      return;
    }

    for (const { oldDoc, newDoc } of modifications) {
      this.docs.delete(oldDoc._id as string);
      this.docs.set(newDoc._id as string, newDoc);
    }

    const updatedDocs = modifications.map(modification => modification.newDoc);
    this.persistence.persistNewState(updatedDocs, err => {
      if (err) {
        callback(err, 0);
        return;
      }

      if (normalizedOptions.returnUpdatedDocs) {
        callback(
          null,
          updatedDocs.length,
          multi ? updatedDocs.map(doc => deepCopy(doc)) : deepCopy(updatedDocs[0] || null),
          false,
        );
        return;
      }

      callback(null, updatedDocs.length);
    });
  }

  update(
    query: QueryValue,
    updateQuery: T,
    options?: InternalUpdateOptions | InternalUpdateCallback<T>,
    callback?: InternalUpdateCallback<T>,
  ) {
    this.executor.push({ this: this, fn: this._update, arguments }, false);
    if (!options && !callback && arguments.length === 2) {
      return;
    }
  }

  _remove(
    query: QueryValue,
    options: InternalRemoveOptions | ((err: Error | null, numRemoved: number) => void) = {},
    cb?: (err: Error | null, numRemoved: number) => void,
  ) {
    const normalizedOptions = typeof options === 'function' ? {} : options;
    const callback = (typeof options === 'function' ? options : cb) || (() => {});
    const normalizedQuery = normalizeQuery(query);
    const multi = normalizedOptions.multi || false;
    const removedDocs: DeletedDoc[] = [];

    try {
      for (const doc of this.getAllData()) {
        if (match(doc, normalizedQuery) && (multi || removedDocs.length === 0)) {
          removedDocs.push({ $$deleted: true, _id: doc._id as string });
          this.docs.delete(doc._id as string);
        }
      }
    } catch (err) {
      callback(err as Error, 0);
      return;
    }

    this.persistence.persistNewState(removedDocs, err => {
      callback(err || null, err ? 0 : removedDocs.length);
    });
  }

  remove(
    query: QueryValue,
    options?: InternalRemoveOptions | ((err: Error | null, numRemoved: number) => void),
    callback?: (err: Error | null, numRemoved: number) => void,
  ) {
    this.executor.push({ this: this, fn: this._remove, arguments }, false);
    if (!options && !callback && arguments.length === 1) {
      return;
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace -- preserve NeDB-compatible type access like Datastore.DataStoreOptions
namespace Datastore {
  export type DataStoreOptions = InternalDataStoreOptions;
  export type RemoveOptions = InternalRemoveOptions;
  export type UpdateCallback<T> = InternalUpdateCallback<T>;
  export type UpdateOptions = InternalUpdateOptions;
}

export default Datastore;
