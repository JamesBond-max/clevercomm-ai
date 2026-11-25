import {test} from 'node:test';
import assert from 'node:assert/strict';

import {
  mkdtemp,
  rm,
  readFile
} from 'node:fs/promises';

import {tmpdir} from 'node:os';
import path from 'node:path';

import {openStore} from './store.mjs';

import {
  createApp,
  geminiBody,
  validateImage
} from './server.mjs';


test('CleverComm API integration',async t => {

  const dir = await mkdtemp(
    path.join(tmpdir(),'cc-')
  );

  const file = path.join(dir,'store.json');

  const store = await openStore({file});

  let received;

  // Deterministic substitute for live AI.
  // Tests do not require network access.

  const app = createApp({
    store,

    generate:async input => {

      received = input;

      if (input.text === 'simulate failure') {
        throw Error('offline');
      }

      return {
        text:'Test response: '+input.text,
        model:'mock'
      };
    }
  });

  await new Promise(resolve =>

    app.listen(0,'127.0.0.1',resolve)
  );

  t.after(async () => {

    await new Promise(resolve =>
      app.close(resolve)
    );

    await store.close();

    await rm(dir,{
      recursive:true,
      force:true
    });
  });

  const base =
    `http://127.0.0.1:${app.address().port}`;

  async function call(
    route,
    method='GET',
    body,
    cookie,
    extra={}
  ) {

    const r = await fetch(base+route,{
      method,

      headers:{
        ...(body!==undefined
          ? {'Content-Type':'application/json'}
          : {}),

        ...(cookie ? {Cookie:cookie} : {}),

        ...extra
      },

      ...(body!==undefined
        ? {body:JSON.stringify(body)}
        : {})
    });

    return {
      status:r.status,
      body:await r.json(),
      cookie:r.headers.get('set-cookie')?.split(';')[0],
      headers:r.headers
    };
  }

  const user = {
    email:'engineer@example.com',
    password:'long-test-password'
  };

  let a,b,id;


  await t.test(
    'protected routes reject unauthenticated requests',
    async () => {

      assert.equal(
        (await call('/api/chats')).status,
        401
      );
    }
  );


  await t.test(
    'registration hashes passwords and duplicate accounts fail',
    async () => {

      const r = await call(
        '/api/register','POST',user
      );

      assert.equal(r.status,200);

      a=r.cookie;

      assert.ok(
        r.headers.get('set-cookie').includes('HttpOnly')
      );

      assert.equal(
        (await call('/api/register','POST',user)).status,
        409
      );

      assert.ok(
        !(await readFile(file,'utf8')).includes(user.password)
      );

      assert.equal(
        (await call(
          '/api/login','POST',
          {...user,password:'wrong-password'}
        )).status,
        401
      );
    }
  );


  await t.test(
    'create conversation and retain context across turns',
    async () => {

      const r = await call(
        '/api/chats','POST',{},a
      );

      assert.equal(r.status,201);

      id=r.body.id;

      for (const text of [
        'Explain AXI',
        'Explain that again'
      ]) {

        assert.equal(
          (await call(
            `/api/chats/${id}/message`,
            'POST',
            {text,mode:'technical',consent:true},
            a
          )).status,
          200
        );
      }

      assert.equal(
        received.history.length,2
      );

      assert.equal(
        received.history[0].text,'Explain AXI'
      );

      assert.equal(
        (await call(
          `/api/chats/${id}`,
          'GET',undefined,a
        )).body.messages.length,
        4
      );
    }
  );


  await t.test(
    'other accounts cannot read or delete private chats',
    async () => {

      b=(await call(
        '/api/register','POST',
        {
          email:'other@example.com',
          password:'another-test-password'
        }
      )).cookie;

      assert.equal(
        (await call(
          `/api/chats/${id}`,
          'GET',undefined,b
        )).status,
        404
      );

      assert.equal(
        (await call(
          `/api/chats/${id}`,
          'DELETE',undefined,b
        )).status,
        404
      );

      assert.deepEqual(
        (await call(
          '/api/chats','GET',undefined,b
        )).body,
        []
      );
    }
  );


  await t.test(
    'invalid mode, consent, image and cross-origin are rejected',
    async () => {

      const route=`/api/chats/${id}/message`;

      const body={
        text:'test',
        mode:'diagram',
        consent:true
      };

      for(const patch of [
        {mode:'invalid'},
        {consent:false},

        {
          image:{
            mime:'image/png',
            data:'YWJj'
          }
        }
      ]) {

        assert.equal(
          (await call(
            route,'POST',
            {...body,...patch},a
          )).status,
          400
        );
      }

      assert.equal(
        (await call(
          route,'POST',body,a,
          {Origin:'https://example.com'}
        )).status,
        403
      );
    }
  );


  await t.test(
    'image forwarding and Gemini history request structure',
    async () => {

      const png =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';

      const image={
        mime:'image/png',
        data:png
      };

      assert.deepEqual(
        validateImage(image),image
      );

      const r=await call(
        `/api/chats/${id}/message`,
        'POST',
        {
          text:'Describe image',
          mode:'diagram',
          consent:true,
          image
        },
        a
      );

      assert.equal(r.status,200);

      const payload=geminiBody(received);

      assert.deepEqual(
        payload.contents.at(-1).parts[1].inlineData,
        {
          mimeType:image.mime,
          data:png
        }
      );

      assert.equal(
        payload.contents[1].role,'model'
      );

      assert.equal(
        r.body.messages.at(-2).hadImage,
        true
      );

      assert.ok(
        !(await readFile(file,'utf8')).includes(png)
      );
    }
  );


  await t.test(
    'failed model call saves no partial conversation',
    async () => {

      assert.equal(
        (await call(
          `/api/chats/${id}/message`,
          'POST',
          {
            text:'simulate failure',
            mode:'general',
            consent:true
          },
          a
        )).status,
        502
      );

      assert.equal(
        (await call(
          `/api/chats/${id}`,
          'GET',undefined,a
        )).body.messages.length,
        6
      );
    }
  );


  await t.test(
    'storage persists across reopen, logout revokes session and deletion works',
    async () => {

      const reopened = await openStore({file});

      assert.equal(
        (await reopened.find(
          'chats',{_id:id,owner:user.email}
        )).messages.length,
        6
      );

      await reopened.close();

      assert.equal(
        (await call(
          '/api/logout','POST',{},a
        )).status,
        200
      );

      assert.equal(
        (await call(
          '/api/me','GET',undefined,a
        )).status,
        401
      );

      a=(await call(
        '/api/login','POST',user
      )).cookie;

      assert.equal(
        (await call(
          `/api/chats/${id}`,
          'DELETE',undefined,a
        )).status,
        200
      );

      assert.deepEqual(
        (await call(
          '/api/chats','GET',undefined,a
        )).body,
        []
      );
    }
  );
});
