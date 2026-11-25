import fs from 'node:fs';
import path from 'node:path';

export async function openStore({file, uri} = {}) {

  // Optional MongoDB storage adapter.

  if (uri) {
    const {MongoClient} = await import('mongodb');

    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 10000
    });

    try {
      await client.connect();

      const db = client.db('clevercomm');

      await db.command({ping: 1});

      const col = name => db.collection(name);

      return {
        kind: 'mongodb',

        find: (n, q) => col(n).findOne(q),

        list: (n, q) => col(n).find(q).toArray(),

        insert: (n, d) => col(n).insertOne(d),

        replace: async (n, q, d) =>
          (await col(n).replaceOne(q, d)).matchedCount === 1,

        remove: async (n, q) =>
          (await col(n).deleteOne(q)).deletedCount === 1,

        close: () => client.close()
      };

    } catch (e) {
      await client.close();
      throw e;
    }
  }

  // Local persistent storage for single-process demonstrations.

  file = path.resolve(file || 'data/store.json');

  fs.mkdirSync(path.dirname(file), {
    recursive: true
  });

  const read = () =>
    fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file, 'utf8'))
      : {};

  const write = db => {
    const temp = file + '.tmp';

    fs.writeFileSync(
      temp,
      JSON.stringify(db, null, 2),
      {mode: 0o600}
    );

    fs.renameSync(temp, file);
  };

  const match = (d, q) =>
    Object.entries(q).every(([k,v]) => d[k] === v);

  const rows = (db, n) => db[n] ||= [];

  return {

    kind: 'local-json',

    find: async (n, q) =>
      rows(read(), n).find(d => match(d,q)) || null,

    list: async (n, q) =>
      rows(read(), n).filter(d => match(d,q)),

    insert: async (n, d) => {
      const db = read();
      const r = rows(db,n);

      if (r.some(x => x._id === d._id)) {
        throw Object.assign(
          new Error('Duplicate'),
          {code:11000}
        );
      }

      r.push(d);
      write(db);
    },

    replace: async (n,q,d) => {
      const db = read();
      const r = rows(db,n);

      const i = r.findIndex(x => match(x,q));

      if (i < 0) return false;

      r[i] = d;
      write(db);

      return true;
    },

    remove: async (n,q) => {
      const db = read();
      const r = rows(db,n);

      const i = r.findIndex(x => match(x,q));

      if (i < 0) return false;

      r.splice(i,1);
      write(db);

      return true;
    },

    close: async () => {}
  };
}
