const { randomBytes } = require('crypto');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

function isDate(value) {
  return value instanceof Date || (!!value && typeof value.getTime === 'function');
}

function checkKey(key, value) {
  if (typeof key === 'number') {
    key = key.toString();
  }

  if (
    key[0] === '$' &&
    !(key === '$$date' && typeof value === 'number') &&
    !(key === '$$deleted' && value === true)
  ) {
    throw new Error('Field names cannot begin with the $ character');
  }

  if (key.includes('.')) {
    throw new Error('Field names cannot contain a .');
  }
}

function checkObject(obj) {
  if (Array.isArray(obj)) {
    obj.forEach(checkObject);
  }

  if (obj && typeof obj === 'object') {
    Object.keys(obj).forEach(key => {
      checkKey(key, obj[key]);
      checkObject(obj[key]);
    });
  }
}

function serialize(obj) {
  return JSON.stringify(obj, function (key, value) {
    checkKey(key, value);

    if (value === undefined) {
      return undefined;
    }

    if (value === null) {
      return null;
    }

    if (isDate(this[key])) {
      return { $$date: this[key].getTime() };
    }

    return value;
  });
}

function deserialize(rawData) {
  return JSON.parse(rawData, (_key, value) => {
    if (value && typeof value === 'object' && value.$$date !== undefined) {
      return new Date(value.$$date);
    }

    return value;
  });
}

function deepCopy(obj, strictKeys = false) {
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
    return obj.map(item => deepCopy(item, strictKeys));
  }

  if (obj && typeof obj === 'object') {
    return Object.keys(obj).reduce((acc, key) => {
      if (!strictKeys || (key[0] !== '$' && !key.includes('.'))) {
        acc[key] = deepCopy(obj[key], strictKeys);
      }
      return acc;
    }, {});
  }

  return undefined;
}

function getDotValue(obj, field) {
  const fieldParts = Array.isArray(field) ? field : `${field}`.split('.');

  if (!obj) {
    return undefined;
  }

  if (fieldParts.length === 0) {
    return obj;
  }

  if (fieldParts.length === 1) {
    return obj[fieldParts[0]];
  }

  const first = obj[fieldParts[0]];

  if (Array.isArray(first)) {
    const index = parseInt(fieldParts[1], 10);

    if (!Number.isNaN(index)) {
      return getDotValue(first[index], fieldParts.slice(2));
    }

    return first.map(item => getDotValue(item, fieldParts.slice(1)));
  }

  return getDotValue(first, fieldParts.slice(1));
}

function compareNSB(a, b) {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

function compareArrays(a, b, compareStrings) {
  const max = Math.min(a.length, b.length);
  for (let i = 0; i < max; i += 1) {
    const comparison = compareThings(a[i], b[i], compareStrings);
    if (comparison !== 0) {
      return comparison;
    }
  }

  return compareNSB(a.length, b.length);
}

function compareThings(a, b, compareStrings = compareNSB) {
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

  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  const max = Math.min(aKeys.length, bKeys.length);

  for (let i = 0; i < max; i += 1) {
    const keyComparison = compareNSB(aKeys[i], bKeys[i]);
    if (keyComparison !== 0) {
      return keyComparison;
    }

    const comparison = compareThings(a[aKeys[i]], b[bKeys[i]], compareStrings);
    if (comparison !== 0) {
      return comparison;
    }
  }

  return compareNSB(aKeys.length, bKeys.length);
}

function areThingsEqual(a, b) {
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
    if (!bKeys.includes(key) || !areThingsEqual(a[key], b[key])) {
      return false;
    }
  }

  return true;
}

function areComparable(a, b) {
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

const comparisonFunctions = {
  $gt: (a, b) => areComparable(a, b) && a > b,
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

function matchQueryPart(obj, queryKey, queryValue, treatObjAsValue = false) {
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

        if (!fn(objValue, queryValue[key])) {
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

function isPrimitiveType(value) {
  return (
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string' ||
    value === null ||
    isDate(value) ||
    Array.isArray(value)
  );
}

function match(obj, query) {
  if (isPrimitiveType(obj) || isPrimitiveType(query)) {
    return matchQueryPart({ value: obj }, 'value', query);
  }

  for (const key of Object.keys(query)) {
    if (key[0] === '$') {
      throw new Error(`Unknown logical operator ${key}`);
    }

    if (!matchQueryPart(obj, key, query[key])) {
      return false;
    }
  }

  return true;
}

function callSoon(callback, ...args) {
  if (typeof setImmediate === 'function') {
    setImmediate(() => callback(...args));
  } else {
    process.nextTick(() => callback(...args));
  }
}

class Executor {
  constructor() {
    this.buffer = [];
    this.ready = false;
    this.queue = [];
    this.running = false;
  }

  push(task, forceQueuing = false) {
    if (this.ready || forceQueuing) {
      this.queue.push(task);
      this.#drain();
    } else {
      this.buffer.push(task);
    }
  }

  processBuffer() {
    this.ready = true;
    this.queue.push(...this.buffer);
    this.buffer = [];
    this.#drain();
  }

  #drain() {
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
      this.#drain();
    };

    if (typeof lastArg === 'function') {
      args[args.length - 1] = (...callbackArgs) => {
        finish();
        lastArg(...callbackArgs);
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
        lastArg(err);
        return;
      }

      throw err;
    }
  }
}

async function ensureDirectoryExists(dir) {
  await fs.promises.mkdir(dir, { recursive: true });
}

async function crashSafeWriteFile(filename, data) {
  const tempFilename = `${filename}~`;
  await fs.promises.writeFile(tempFilename, data, 'utf8');
  await fs.promises.rename(tempFilename, filename);
}

class Persistence {
  constructor(options) {
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

  setAutocompactionInterval(interval) {
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

  persistCachedDatabase(cb = () => {}) {
    if (this.inMemoryOnly) {
      callSoon(cb, null);
      return;
    }

    const docs = this.db.getAllData();
    const payload = docs
      .map(doc => this.afterSerialization(serialize(doc)))
      .join('\n');
    const data = payload ? `${payload}\n` : '';

    (async () => {
      await ensureDirectoryExists(path.dirname(this.filename));
      await crashSafeWriteFile(this.filename, data);
    })()
      .then(() => {
        this.db.emit('compaction.done');
        cb(null);
      })
      .catch(err => cb(err));
  }

  persistNewState(newDocs, cb = () => {}) {
    if (this.inMemoryOnly || newDocs.length === 0) {
      callSoon(cb, null);
      return;
    }

    const payload = newDocs
      .map(doc => this.afterSerialization(serialize(doc)))
      .join('\n');

    (async () => {
      await ensureDirectoryExists(path.dirname(this.filename));
      await fs.promises.appendFile(this.filename, `${payload}\n`, 'utf8');
    })()
      .then(() => cb(null))
      .catch(err => cb(err));
  }

  treatRawData(rawData) {
    const data = rawData.split('\n');
    const dataById = new Map();
    let corruptItems = -1;

    for (const item of data) {
      if (!item) {
        corruptItems += 1;
        continue;
      }

      try {
        const doc = deserialize(this.beforeDeserialization(item));
        if (doc && doc._id) {
          if (doc.$$deleted === true) {
            dataById.delete(doc._id);
          } else {
            dataById.set(doc._id, doc);
          }
        }
      } catch (err) {
        corruptItems += 1;
      }
    }

    if (data.length > 0 && corruptItems / data.length > this.corruptAlertThreshold) {
      throw new Error(
        `More than ${Math.floor(
          100 * this.corruptAlertThreshold,
        )}% of the data file is corrupt, cautiously refusing to start NeDB to prevent dataloss`,
      );
    }

    return Array.from(dataById.values());
  }

  loadDatabase(cb = () => {}) {
    this.db.clearAllData();

    if (this.inMemoryOnly) {
      callSoon(() => {
        this.db.executor.processBuffer();
        cb(null);
      });
      return;
    }

    (async () => {
      await ensureDirectoryExists(path.dirname(this.filename));

      try {
        await fs.promises.access(this.filename);
      } catch (err) {
        await fs.promises.writeFile(this.filename, '', 'utf8');
      }

      const rawData = await fs.promises.readFile(this.filename, 'utf8');
      const docs = this.treatRawData(rawData);
      this.db.resetData(docs);

      await new Promise((resolve, reject) => {
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
      .catch(err => cb(err));
  }
}

class Cursor {
  constructor(db, query, execFn) {
    this.db = db;
    this.query = normalizeQuery(query);
    this.execFn = execFn;
  }

  limit(limit) {
    this._limit = limit;
    return this;
  }

  sort(sortQuery) {
    this._sort = sortQuery;
    return this;
  }

  _exec(callback) {
    let results = [];

    try {
      results = this.db
        .getAllData()
        .filter(doc => match(doc, this.query));

      if (this._sort) {
        const criteria = Object.keys(this._sort).map(key => ({
          key,
          direction: this._sort[key],
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

  exec() {
    this.db.executor.push({ this: this, fn: this._exec, arguments: arguments });
  }
}

function normalizeQuery(query) {
  if (!query) {
    return {};
  }

  if (typeof query === 'string') {
    return { _id: query };
  }

  return query;
}

class Datastore extends EventEmitter {
  constructor(options = {}) {
    super();

    if (typeof options === 'string') {
      options = {
        filename: options,
      };
    }

    this.inMemoryOnly = options.inMemoryOnly || !options.filename;
    this.autoload = options.autoload || false;
    this.filename = this.inMemoryOnly ? null : options.filename;
    this.compareStrings = options.compareStrings;
    this.persistence = new Persistence({
      db: this,
      afterSerialization: options.afterSerialization,
      beforeDeserialization: options.beforeDeserialization,
      corruptAlertThreshold: options.corruptAlertThreshold,
    });
    this.executor = new Executor();
    this.docs = new Map();

    if (this.inMemoryOnly) {
      this.executor.ready = true;
    }

    if (this.autoload) {
      this.loadDatabase(options.onload || (err => {
        if (err) {
          throw err;
        }
      }));
    }
  }

  loadDatabase() {
    this.executor.push({ this: this.persistence, fn: this.persistence.loadDatabase, arguments }, true);
  }

  getAllData() {
    return Array.from(this.docs.values());
  }

  resetData(docs = []) {
    this.docs = new Map(docs.map(doc => [doc._id, doc]));
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

  prepareDocumentForInsertion(newDoc) {
    const preparedDoc = deepCopy(newDoc);
    if (preparedDoc._id === undefined) {
      preparedDoc._id = this.createNewId();
    }
    checkObject(preparedDoc);
    return preparedDoc;
  }

  _insert(newDoc, cb = () => {}) {
    let preparedDoc;

    try {
      preparedDoc = this.prepareDocumentForInsertion(newDoc);
      this.docs.set(preparedDoc._id, preparedDoc);
    } catch (err) {
      cb(err);
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

  insert() {
    this.executor.push({ this: this, fn: this._insert, arguments });
  }

  count(query, callback) {
    const cursor = new Cursor(this, query, (err, docs, done) => {
      if (err) {
        done(err);
        return;
      }

      done(null, docs.length);
    });

    if (typeof callback === 'function') {
      cursor.exec(callback);
      return;
    }

    return cursor;
  }

  find(query, projection, callback) {
    if (typeof projection === 'function') {
      callback = projection;
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

  _update(query, updateQuery, options, cb) {
    if (typeof options === 'function') {
      cb = options;
      options = {};
    }

    const callback = cb || (() => {});
    const normalizedQuery = normalizeQuery(query);
    const multi = options.multi || false;
    const upsert = options.upsert || false;
    const modifications = [];

    try {
      for (const doc of this.getAllData()) {
        if (match(doc, normalizedQuery) && (multi || modifications.length === 0)) {
          const updatedDoc = deepCopy(updateQuery);
          updatedDoc._id = doc._id;
          checkObject(updatedDoc);
          modifications.push({ oldDoc: doc, newDoc: updatedDoc });
        }
      }
    } catch (err) {
      callback(err);
      return;
    }

    if (modifications.length === 0 && upsert) {
      this._insert(updateQuery, (err, newDoc) => {
        callback(err, err ? 0 : 1, newDoc || null, !err);
      });
      return;
    }

    for (const { oldDoc, newDoc } of modifications) {
      this.docs.delete(oldDoc._id);
      this.docs.set(newDoc._id, newDoc);
    }

    const updatedDocs = modifications.map(modification => modification.newDoc);
    this.persistence.persistNewState(updatedDocs, err => {
      if (err) {
        callback(err);
        return;
      }

      if (options.returnUpdatedDocs) {
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

  update() {
    this.executor.push({ this: this, fn: this._update, arguments });
  }

  _remove(query, options, cb) {
    if (typeof options === 'function') {
      cb = options;
      options = {};
    }

    const callback = cb || (() => {});
    const normalizedQuery = normalizeQuery(query);
    const multi = options.multi || false;
    const removedDocs = [];

    try {
      for (const doc of this.getAllData()) {
        if (match(doc, normalizedQuery) && (multi || removedDocs.length === 0)) {
          removedDocs.push({ $$deleted: true, _id: doc._id });
          this.docs.delete(doc._id);
        }
      }
    } catch (err) {
      callback(err);
      return;
    }

    this.persistence.persistNewState(removedDocs, err => {
      callback(err || null, err ? 0 : removedDocs.length);
    });
  }

  remove() {
    this.executor.push({ this: this, fn: this._remove, arguments });
  }
}

Datastore.Cursor = Cursor;
Datastore.Persistence = Persistence;

module.exports = Datastore;
module.exports.default = Datastore;
