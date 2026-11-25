import React, {
  useState,
  useEffect,
  useRef
} from 'react';

import {createRoot} from 'react-dom/client';

import './styles.css';

const MODES = {
  general:'General conversation',
  technical:'Technical explanation',
  writing:'Documentation review',
  diagram:'Diagram interpretation'
};

async function api(route, method='GET', body) {

  const response = await fetch('/api'+route,{
    method,

    headers:body !== undefined
      ? {'Content-Type':'application/json'}
      : {},

    credentials:'same-origin',

    ...(body !== undefined
      ? {body:JSON.stringify(body)}
      : {})
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error || 'Request failed.'
    );
  }

  return data;
}

function Brand() {
  return (
    <div className="brand">
      <div className="logo">C</div>
      <div>
        <strong>CleverComm AI</strong>
        <small>Technical communication</small>
      </div>
    </div>
  );
}

function Login({onLogin}) {

  const [register,setRegister] = useState(false);
  const [email,setEmail] = useState('');
  const [password,setPassword] = useState('');
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);

  async function submit(e) {

    e.preventDefault();

    setError('');
    setBusy(true);

    try {

      const user = await api(
        register ? '/register' : '/login',
        'POST',
        {email,password}
      );

      await onLogin(user);

    } catch(e) {

      setError(e.message);

    } finally {

      setBusy(false);
    }
  }

  return (
    <main className="auth-page">

      <section className="auth-card">

        <Brand />

        <p className="eyebrow">YOUR AI WORKSPACE</p>

        <h1>
          {register ? 'Create an account' : 'Welcome back'}
        </h1>

        <p className="muted">
          Explain complex ideas, improve documentation
          and understand technical diagrams.
        </p>

        <form onSubmit={submit}>

          <label>
            Email
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="engineer@example.com"
              autoComplete="email"
            />
          </label>

          <label>
            Password
            <input
              type="password"
              required
              minLength={10}
              maxLength={128}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="At least 10 characters"
              autoComplete={
                register
                  ? 'new-password'
                  : 'current-password'
              }
            />
          </label>

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}

          <button
            className="primary full"
            disabled={busy}
          >
            {
              busy
                ? 'Please wait...'
                : register
                  ? 'Create account'
                  : 'Sign in'
            }
          </button>

        </form>

        <button
          className="text-button"
          disabled={busy}

          onClick={() => {
            setRegister(!register);
            setError('');
          }}
        >
          {
            register
              ? 'Already have an account? Sign in'
              : 'New here? Create an account'
          }
        </button>

        <p className="small muted">
          Local portfolio prototype. Use demonstration
          credentials rather than personal passwords.
        </p>

      </section>

    </main>
  );
}

function Workspace({user,onLogout}) {

  const [chats,setChats] = useState([]);
  const [active,setActive] = useState(null);

  const [draft,setDraft] = useState('');
  const [mode,setMode] = useState('technical');

  const [image,setImage] = useState(null);
  const [imageName,setImageName] = useState('');

  const [consent,setConsent] = useState(false);
  const [busy,setBusy] = useState(false);

  const [error,setError] = useState('');
  const [health,setHealth] = useState(null);

  const bottom = useRef(null);
  const fileInput = useRef(null);

  async function refresh() {

    const list = await api('/chats');

    setChats(list);

    return list;
  }

  useEffect(() => {

    let mounted = true;

    async function load() {

      try {

        const list = await api('/chats');
        const h = await api('/health');

        if (!mounted) return;

        setChats(list);
        setHealth(h);

        if (list.length) {

          const chat = await api(
            '/chats/'+list[0].id
          );

          if (mounted) setActive(chat);
        }

      } catch(e) {

        if (mounted) setError(e.message);
      }
    }

    setBusy(true);

    load().finally(() => {

      if (mounted) setBusy(false);
    });

    return () => {mounted=false;};

  },[]);

  useEffect(() => {

    bottom.current?.scrollIntoView({
      behavior:'smooth'
    });

  },[active,busy]);

  function clearImage() {

    setImage(null);
    setImageName('');

    if (fileInput.current) {
      fileInput.current.value='';
    }
  }

  async function selectChat(id) {

    setError('');
    setBusy(true);

    try {

      setActive(
        await api('/chats/'+id)
      );

      setDraft('');
      clearImage();

    } catch(e) {

      setError(e.message);

    } finally {

      setBusy(false);
    }
  }

  async function newChat() {

    setBusy(true);
    setError('');

    try {

      const chat = await api(
        '/chats','POST',{}
      );

      setActive(chat);
      setDraft('');
      clearImage();

      await refresh();

    } catch(e) {

      setError(e.message);

    } finally {

      setBusy(false);
    }
  }

  async function deleteChat() {

    if (!active) return;

    if (!window.confirm('Delete this conversation?')) {
      return;
    }

    setBusy(true);
    setError('');

    try {

      await api(
        '/chats/'+active.id,
        'DELETE'
      );

      setActive(null);
      setDraft('');
      clearImage();

      await refresh();

    } catch(e) {

      setError(e.message);

    } finally {

      setBusy(false);
    }
  }

  function attach(e) {

    const f = e.target.files?.[0];

    setError('');
    clearImage();

    if (!f) return;

    if (
      !['image/png','image/jpeg'].includes(f.type)
      || f.size > 1_500_000
    ) {

      setError(
        'Please select a PNG or JPEG under 1.5 MB.'
      );

      return;
    }

    setBusy(true);

    const reader = new FileReader();

    reader.onload = () => {

      setImage({
        mime:f.type,
        data:String(reader.result).split(',')[1]
      });

      setImageName(f.name);
      setBusy(false);
    };

    reader.onerror = () => {

      setError('Could not read the image.');
      setBusy(false);
    };

    reader.readAsDataURL(f);
  }

  async function send(e) {

    e.preventDefault();

    if (!draft.trim() || !consent || busy) return;

    setBusy(true);
    setError('');

    try {

      let chat = active;

      if (!chat) {

        chat = await api(
          '/chats','POST',{}
        );

        setActive(chat);

        await refresh();
      }

      const updated = await api(
        '/chats/'+chat.id+'/message',
        'POST',
        {
          text:draft,
          mode,
          image,
          consent
        }
      );

      setActive(updated);
      setDraft('');
      clearImage();

      await refresh();

    } catch(e) {

      setError(e.message);

    } finally {

      setBusy(false);
    }
  }

  async function logout() {

    setBusy(true);

    try {

      await api('/logout','POST',{});

      onLogout();

    } catch(e) {

      setError(e.message);

    } finally {

      setBusy(false);
    }
  }

  return (
    <div className="app">

      <aside className="sidebar">

        <Brand />

        <button
          className="primary"
          onClick={newChat}
          disabled={busy}
        >
          + New conversation
        </button>

        <p className="eyebrow">CONVERSATIONS</p>

        <nav className="history">

          {chats.map(c => (

            <button
              key={c.id}
              className={
                'chat-link'
                + (active?.id===c.id ? ' selected' : '')
              }
              disabled={busy}
              onClick={() => selectChat(c.id)}
            >
              {c.title}
            </button>
          ))}

          {!chats.length && (
            <p className="small muted">
              No conversations yet.
            </p>
          )}

        </nav>

        <div className="account">

          <div className="small muted">Signed in as</div>

          <div className="email">{user.email}</div>

          <button
            className="secondary full"
            onClick={logout}
            disabled={busy}
          >
            Sign out
          </button>

        </div>

      </aside>

      <main className="workspace">

        <header className="topbar">

          <div>
            <strong>
              {active?.title || 'New conversation'}
            </strong>

            <div className="small muted">
              Technical communication assistant
            </div>
          </div>

          <div className="top-actions">

            {health && (

              <span className="status">

                {health.aiConfigured
                  ? 'Gemini configured'
                  : 'Gemini key missing'}

                {' / '}

                {health.storage==='mongodb'
                  ? 'MongoDB'
                  : 'Local storage'}

              </span>
            )}

            {active && (

              <button
                className="secondary"
                onClick={deleteChat}
                disabled={busy}
              >
                Delete chat
              </button>
            )}

          </div>

        </header>

        <section className="messages">

          {!active?.messages.length && (

            <div className="welcome">

              <div className="welcome-icon">C</div>

              <p className="eyebrow">
                AI-ASSISTED ENGINEERING
              </p>

              <h1>What are we working on?</h1>

              <p className="muted">
                Ask a question, refine a technical
                document or upload an engineering diagram.
              </p>

              <div className="suggestions">

                {[
                  {
                    title:'Explain a concept',
                    text:'Explain the AXI4-Stream ready and valid handshake.',
                    mode:'technical'
                  },
                  {
                    title:'Improve documentation',
                    text:'Rewrite this specification clearly: The clock frequency is 800 MHz.',
                    mode:'writing'
                  },
                  {
                    title:'Analyze a diagram',
                    text:'Describe the components and flow in this diagram.',
                    mode:'diagram'
                  }
                ].map(s => (

                  <button
                    className="suggestion"
                    key={s.title}
                    disabled={busy}

                    onClick={() => {
                      setDraft(s.text);
                      setMode(s.mode);
                    }}
                  >
                    <strong>{s.title}</strong>
                    <small>{s.text}</small>
                  </button>
                ))}

              </div>

            </div>
          )}

          {active?.messages.map((m,i) => (

            <article
              key={i}
              className={'message '+m.role}
            >

              <div className="message-heading">

                <strong>
                  {
                    m.role==='assistant'
                      ? 'CleverComm'
                      : 'You'
                  }
                </strong>

                {m.hadImage && (
                  <span className="status">
                    Image attached
                  </span>
                )}

              </div>

              <div className="message-text">
                {m.text}
              </div>

              {m.role==='assistant' && (

                <div className="small muted response-info">
                  {m.model} | {(m.latencyMs/1000).toFixed(2)} s
                </div>
              )}

            </article>
          ))}

          {busy && (
            <p className="muted small">
              Processing...
            </p>
          )}

          <div ref={bottom}/>

        </section>

        <div className="composer-area">

          {error && (

            <p className="error" role="alert">
              {error}
            </p>
          )}

          <form className="composer" onSubmit={send}>

            {image && (

              <div className="attachment">

                <img
                  src={`data:${image.mime};base64,${image.data}`}
                  alt="Selected attachment"
                />

                <span>{imageName}</span>

                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={clearImage}
                >
                  Remove
                </button>

              </div>
            )}

            <textarea
              value={draft}
              disabled={busy}
              maxLength={4000}
              onChange={e=>setDraft(e.target.value)}
              placeholder="Ask a technical question..."
              aria-label="Your message"
              rows={4}
            />

            <div className="composer-actions">

              <div className="mode-controls">

                <select
                  value={mode}
                  disabled={busy}
                  aria-label="Communication mode"
                  onChange={e=>setMode(e.target.value)}
                >
                  {
                    Object.entries(MODES).map(
                      ([key,label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      )
                    )
                  }
                </select>

                <input
                  type="file"
                  className="hidden"
                  ref={fileInput}
                  accept="image/png,image/jpeg"
                  onChange={attach}
                />

                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => fileInput.current?.click()}
                >
                  + Image
                </button>

              </div>

              <button
                className="primary"
                disabled={
                  busy || !draft.trim() || !consent
                }
              >
                {busy ? 'Working...' : 'Send'}
              </button>

            </div>

            <label className="consent">

              <input
                type="checkbox"
                checked={consent}
                disabled={busy}
                onChange={e=>setConsent(e.target.checked)}
              />

              I authorize sending this message,
              recent chat context and any attachment
              to Gemini.

            </label>

          </form>

          <p className="disclaimer">
            Use authorized, non-confidential content.
            AI-generated engineering drafts require review.
          </p>

        </div>

      </main>

    </div>
  );
}

function App() {

  const [user,setUser] = useState(null);
  const [loading,setLoading] = useState(true);

  useEffect(() => {

    api('/me')
      .then(setUser)
      .catch(()=>setUser(null))
      .finally(()=>setLoading(false));

  },[]);

  if (loading) {
    return (
      <main className="auth-page">
        <p>Loading CleverComm...</p>
      </main>
    );
  }

  return user

    ? <Workspace
        user={user}
        onLogout={()=>setUser(null)}
      />

    : <Login onLogin={setUser}/>;
}

createRoot(
  document.getElementById('root')
).render(<App/>);
