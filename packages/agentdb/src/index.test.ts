import { afterEach, describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import Datastore = require('./index');

function countDocs<T>(db: Datastore<T>, query: any) {
  return new Promise<number>((resolve, reject) => {
    db.count(query, (err, total) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(total);
    });
  });
}

function exec<T>(cursor: { exec: (callback: (err: Error | null, docs: T[]) => void) => void }) {
  return new Promise<T[]>((resolve, reject) => {
    cursor.exec((err, docs) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(docs);
    });
  });
}

function insert<T>(db: Datastore<T>, doc: T) {
  return new Promise<T>((resolve, reject) => {
    db.insert(doc, (err, newDoc) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(newDoc);
    });
  });
}

function updateDoc<T>(db: Datastore<T>, query: any, doc: T) {
  return new Promise<number>((resolve, reject) => {
    db.update(query, doc, (err, numAffected) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(numAffected);
    });
  });
}

function removeDocs<T>(db: Datastore<T>, query: any, options?: { multi?: boolean }) {
  return new Promise<number>((resolve, reject) => {
    db.remove(query, options || {}, (err, numRemoved) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(numRemoved);
    });
  });
}

function persistCachedDatabase<T>(db: Datastore<T>) {
  return new Promise<void>((resolve, reject) => {
    db.persistence.persistCachedDatabase(err => {
      if (err) {
        reject(err);
        return;
      }

      resolve();
    });
  });
}

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe('agentdb', () => {
  it('supports the query, sort, and limit surface Insomnium uses', async () => {
    const db = new Datastore<{ _id: string; modified: number; parentId: string | null; type: string }>({
      inMemoryOnly: true,
    });

    await insert(db, { _id: 'a', modified: 1, parentId: null, type: 'Request' });
    await insert(db, { _id: 'b', modified: 4, parentId: 'a', type: 'Request' });
    await insert(db, { _id: 'c', modified: 2, parentId: null, type: 'Environment' });

    expect(await countDocs(db, { parentId: null })).toBe(2);
    expect(await countDocs(db, { modified: { $gt: 1 } })).toBe(2);
    expect(await countDocs(db, { _id: { $in: ['a', 'b'] } })).toBe(2);
    expect(await countDocs(db, { _id: { $nin: ['a', 'b'] } })).toBe(1);

    const docs = await exec(
      db.find({ type: 'Request' }).sort({ modified: -1 }).limit(1),
    );

    expect(docs).toEqual([{ _id: 'b', modified: 4, parentId: 'a', type: 'Request' }]);
  });

  it('loads and compacts existing NeDB-compatible data files', async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'agentdb-'));
    const filename = path.join(tempDir, 'insomnia.Request.db');

    await fs.promises.writeFile(
      filename,
      [
        '{"_id":"req_1","type":"Request","modified":1}',
        'not-json',
        '{"_id":"req_1","type":"Request","modified":2}',
        '{"_id":"req_2","type":"Request","modified":3}',
        '{"$$deleted":true,"_id":"req_2"}',
        '',
      ].join('\n'),
      'utf8',
    );

    const db = new Datastore<{ _id: string; modified: number; type: string }>({
      autoload: true,
      corruptAlertThreshold: 0.9,
      filename,
    });

    expect(await exec(db.find({ type: 'Request' }).sort({ modified: 1 }))).toEqual([
      { _id: 'req_1', modified: 2, type: 'Request' },
    ]);

    await insert(db, { _id: 'req_3', modified: 4, type: 'Request' });
    await updateDoc(db, { _id: 'req_3' }, { _id: 'req_3', modified: 5, type: 'Request' });
    await removeDocs(db, { _id: 'req_1' });
    await persistCachedDatabase(db);

    expect(await exec(db.find({}).sort({ modified: 1 }))).toEqual([
      { _id: 'req_3', modified: 5, type: 'Request' },
    ]);

    expect((await fs.promises.readFile(filename, 'utf8')).trim().split('\n')).toEqual([
      '{"_id":"req_3","modified":5,"type":"Request"}',
    ]);
  });
});
