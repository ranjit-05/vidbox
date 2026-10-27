import React, { useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowRight, Check, ChevronDown, Clapperboard, Film, Menu, Play, Search, ShieldCheck, Sparkles, Ticket, Upload, X } from 'lucide-react';
import { api, getToken } from './api.js';

function App() {
  const [user, setUser] = useState(null);
  const [films, setFilms] = useState([]);
  const [authOpen, setAuthOpen] = useState(false);
  const [authIntent, setAuthIntent] = useState('signin');
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([api('/media'), getToken() ? api('/auth/me') : Promise.resolve(null)])
      .then(([catalog, session]) => { setFilms(catalog.media); if (session) setUser(session.user); })
      .catch((error) => setToast(error.message)).finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 3400); return () => clearTimeout(t); } }, [toast]);

  function requestSignIn() { setAuthIntent('signin'); setAuthOpen(true); }
  function signOut() { localStorage.removeItem('reelbox_token'); setUser(null); navigate('/'); setToast('You’re signed out.'); }
  async function purchase(film) {
    if (!user) { setAuthIntent('signin'); setAuthOpen(true); return; }
    try {
      const data = await api('/orders/checkout', { method: 'POST', body: JSON.stringify({ mediaId: film.id }) });
      if (data.paymentMode === 'razorpay') {
        await openRazorpayCheckout(data, film);
        return;
      }
      const complete = await api(`/orders/${data.order.id}/demo-complete`, { method: 'POST' });
      if (complete.order.status === 'paid') {
        const fresh = await api('/auth/me'); setUser(fresh.user); setToast(`You’re all set. ${film.title} is in your library.`);
      }
    } catch (error) { setToast(error.message); }
  }

  async function openRazorpayCheckout(data, film) {
    if (!window.Razorpay) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.onload = resolve;
        script.onerror = () => reject(new Error('Could not load Razorpay Checkout. Check your connection and try again.'));
        document.body.appendChild(script);
      });
    }
    const checkout = new window.Razorpay({
      key: data.razorpay.keyId,
      amount: data.razorpay.amount,
      currency: data.razorpay.currency,
      name: data.razorpay.name,
      description: data.razorpay.description,
      order_id: data.razorpay.orderId,
      prefill: data.razorpay.prefill,
      theme: { color: '#e8754f' },
      handler: async (response) => {
        try {
          await api(`/orders/${data.order.id}/verify`, { method: 'POST', body: JSON.stringify(response) });
          for (let attempt = 0; attempt < 14; attempt++) {
            const current = await api(`/orders/${data.order.id}`);
            if (current.order.status === 'paid') {
              const fresh = await api('/auth/me'); setUser(fresh.user); setToast(`${film.title} is now in your library.`); return;
            }
            if (current.order.status === 'failed') { setToast('The payment did not complete. You can try again.'); return; }
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
          setToast('Payment is still being confirmed. Your library will update when Razorpay confirms it.');
        } catch (error) { setToast(error.message); }
      },
      modal: { ondismiss: () => setToast('Checkout closed. No payment was confirmed.') }
    });
    checkout.on('payment.failed', () => setToast('The payment did not complete. You can try again.'));
    checkout.open();
  }

  function filmCreated(media) {
    setFilms((current) => [media, ...current]);
    navigate('/');
    setToast(`${media.title} was added to the Vidbox collection.`);
  }

  return <div className="app-shell">
    <Header user={user} onSignIn={requestSignIn} onSignOut={signOut} />
    <Routes>
      <Route path="/" element={<Home films={films} loading={loading} user={user} purchase={purchase} onSignIn={requestSignIn} />} />
      <Route path="/admin" element={<AdminUpload user={user} onSignIn={requestSignIn} onAdmin={(nextUser) => setUser(nextUser)} onCreated={filmCreated} />} />
      <Route path="/film/:id" element={<FilmDetails user={user} purchase={purchase} />} />
      <Route path="/library" element={<Library user={user} onSignIn={requestSignIn} onToast={setToast} />} />
      <Route path="/watch/:id" element={<Watch user={user} onSignIn={requestSignIn} onToast={setToast} />} />
      <Route path="*" element={<main className="not-found"><span className="eyebrow">404 · LOST IN THE EDIT</span><h1>This scene isn’t in the cut.</h1><Link className="button button-primary" to="/">Back to the films <ArrowRight size={16} /></Link></main>} />
    </Routes>
    <Footer />
    {authOpen && <AuthModal initialMode={authIntent} onClose={() => setAuthOpen(false)} onSuccess={(result) => { localStorage.setItem('reelbox_token', result.token); setUser(result.user); setAuthOpen(false); setToast('Welcome to Vidbox.'); }} />}
    {toast && <div className="toast" role="status"><span className="toast-dot" />{toast}<button onClick={() => setToast('')} aria-label="Dismiss"><X size={16} /></button></div>}
  </div>;
}

function Header({ user, onSignIn, onSignOut }) {
  const [menu, setMenu] = useState(false);
  return <header className="topbar"><div className="topbar-inner">
    <Link className="brand" to="/"><span className="brand-mark"><Clapperboard size={17} strokeWidth={2.3} /></span><span>vidbox<span className="brand-period">.</span></span></Link>
    <nav className={`nav-links ${menu ? 'nav-open' : ''}`}><NavLink end to="/" onClick={() => setMenu(false)}>Discover</NavLink><NavLink to="/library" onClick={() => setMenu(false)}>My library</NavLink></nav>
    <div className="top-actions">{user ? <><Link className="button button-small button-outline upload-nav" to="/admin" onClick={() => setMenu(false)}><Upload size={13} /> Add a film</Link><span className="user-email">{user.email}</span><button className="avatar" title="Sign out" onClick={onSignOut}>{user.email.slice(0, 1).toUpperCase()}</button></> : <button className="button button-small button-outline" onClick={onSignIn}>Sign in</button>}<button className="menu-button" onClick={() => setMenu(!menu)} aria-label="Toggle menu"><Menu size={19} /></button></div>
  </div></header>;
}

function Home({ films, loading, user, purchase, onSignIn }) {
  const [query, setQuery] = useState('');
  const [genre, setGenre] = useState('All films');
  const [sort, setSort] = useState('Featured');
  const featured = films.find((f) => f.featured) || films[0];
  const genres = ['All films', ...new Set(films.map((film) => film.genre))];
  let filtered = films.filter((f) => (genre === 'All films' || f.genre === genre) && `${f.title} ${f.genre} ${f.description}`.toLowerCase().includes(query.toLowerCase()));
  if (sort === 'Price: low to high') filtered = [...filtered].sort((a, b) => a.price - b.price);
  if (sort === 'Newest first') filtered = [...filtered].sort((a, b) => b.year - a.year);
  return <main>
    <section className="hero"><div className="hero-grain" /><div className="hero-lines" /><div className="hero-content"><div className="eyebrow hero-label"><span className="live-dot" />THE INDEPENDENT FILM CLUB</div><h1>Stories worth<br />staying in <em>for.</em></h1><p>Find your next favourite in a collection of films that stay with you long after the credits.</p><a className="button button-cream" href="#collection">Explore the collection <ArrowDown size={16} /></a><div className="hero-footnote"><span><Sparkles size={14} /> Hand-picked, always.</span><span>01 — 06 <span className="foot-divider" /> The good stuff</span></div></div>
      <div className="hero-art" aria-label={featured?.title || 'Featured film artwork'}><div className="art-glow" /><div className="art-sun" /><div className="art-shape art-shape-one" /><div className="art-shape art-shape-two" /><div className="art-shape art-shape-three" /><div className="art-title"><span>A VIDBOX ORIGINAL</span><strong>THE<br />LAST<br /><i>LIGHT</i></strong><small>A FILM ABOUT FINDING YOUR WAY</small></div><div className="art-edge-label">FILM Nº 001&nbsp;&nbsp; · &nbsp;&nbsp;2025</div></div>
    </section>
    <section className="intro-strip"><p>Not another endless scroll.</p><span>Just good films, and more time to watch them.</span><div className="strip-symbol">✳</div></section>
    <section id="collection" className="collection section-wrap"><div className="section-heading"><div><div className="eyebrow">THE COLLECTION <span className="heading-line" /></div><h2>A good place to <em>start.</em></h2><p>Stories with a little more to say.</p></div><span className="collection-count">{films.length.toString().padStart(2, '0')} FILMS &nbsp;·&nbsp; ALL INDEPENDENT</span></div>
      <div className="filter-bar"><div className="genre-tabs">{genres.map((g) => <button key={g} className={genre === g ? 'genre-active' : ''} onClick={() => setGenre(g)}>{g}</button>)}</div><div className="filter-tools"><label className="search-box"><Search size={15} /><input placeholder="Find a film" value={query} onChange={(e) => setQuery(e.target.value)} /><kbd>⌘ K</kbd></label><label className="sort-box"><select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort films"><option>Featured</option><option>Newest first</option><option>Price: low to high</option></select><ChevronDown size={14} /></label></div></div>
      {loading ? <div className="loading-grid">{[1, 2, 3].map((n) => <div className="skeleton" key={n} />)}</div> : filtered.length ? <div className="film-grid">{filtered.map((film, i) => <FilmCard key={film.id} film={film} index={i} owned={user?.purchasedVideoIds.includes(film.id)} onPurchase={() => purchase(film)} onSignIn={onSignIn} />)}</div> : <div className="empty-results"><Film size={24} /><h3>No films found</h3><p>Try a different title or genre.</p></div>}
    </section>
    <section className="manifesto"><div className="manifesto-mark">“</div><p>Less algorithm.<br /><em>More alchemy.</em></p><span>Every film here was picked by a person who loved it.</span></section>
    <section className="promise-row"><div><span className="promise-icon"><Ticket size={18} /></span><strong>Pay once, keep it.</strong><small>A film that’s yours is yours.</small></div><div><span className="promise-icon"><ShieldCheck size={18} /></span><strong>Your watch, your way.</strong><small>Private, secure streaming.</small></div><div><span className="promise-icon"><Sparkles size={18} /></span><strong>Made for the curious.</strong><small>Stories from outside the mainstream.</small></div></section>
  </main>;
}

function FilmCard({ film, index, owned, onPurchase }) {
  const [busy, setBusy] = useState(false);
  async function buy() { setBusy(true); await onPurchase(); setBusy(false); }
  return <article className="film-card" style={{ '--delay': `${index * 65}ms` }}><Link to={`/film/${film.id}`} className={`poster poster-${film.posterTone}`}><Poster film={film} /><span className="poster-top"><span>{film.year}</span>{film.featured && <span className="poster-featured">VIDBOX PICK</span>}</span><span className="poster-overlay"><span className="play-badge"><Play fill="currentColor" size={16} /></span><span>{owned ? 'View film' : 'A closer look'}</span></span></Link>
    <div className="film-info"><div className="film-meta"><span>{film.genre}</span><i />{film.duration}</div><div className="film-title-row"><h3>{film.title}</h3>{owned && <span className="owned-tag"><Check size={11} /> OWNED</span>}</div><p>{film.description}</p><div className="film-buy-row">{owned ? <Link className="button button-card-owned" to={`/watch/${film.id}`}><Play fill="currentColor" size={12} /> Watch now</Link> : <button className="button button-card" disabled={busy} onClick={buy}>{busy ? 'One moment…' : <><span>Get the film</span><span>₹{film.price}</span></>}</button>}<span className="once-note">{owned ? 'YOURS TO KEEP' : 'ONE-TIME PAYMENT'}</span></div></div>
  </article>;
}

function FilmDetails({ user, purchase }) {
  const { id } = useParams();
  const [film, setFilm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    api(`/media/${id}`).then((result) => { if (!cancelled) setFilm(result.media); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);
  if (loading) return <main className="film-detail section-wrap"><div className="skeleton film-detail-skeleton" /></main>;
  if (error || !film) return <main className="film-detail section-wrap"><Link className="back-link" to="/"><ArrowLeft size={15} /> Back to the collection</Link><h1>We couldn’t find that film.</h1><p>{error || 'It may have been removed from the collection.'}</p></main>;
  const owned = Boolean(user?.purchasedVideoIds.includes(film.id));
  return <main className="film-detail section-wrap">
    <Link className="back-link" to="/"><ArrowLeft size={15} /> Back to the collection</Link>
    <div className="film-detail-layout">
      <div className={`film-detail-poster poster-${film.posterTone}`}><Poster film={film} /></div>
      <div className="film-detail-copy"><div className="eyebrow">{film.featured ? 'VIDBOX PICK' : 'FROM THE COLLECTION'} <span className="heading-line" /></div>
        <div className="film-meta"><span>{film.genre}</span><i />{film.year}<i />{film.duration}</div>
        <h1>{film.title}</h1><p className="film-detail-description">{film.description}</p>
        <div className="film-detail-actions">{owned ? <Link className="button button-primary" to={`/watch/${film.id}`}><Play fill="currentColor" size={15} /> Watch now</Link> : <button className="button button-primary" onClick={() => purchase(film)}><Ticket size={16} /> Get the film · ₹{film.price}</button>}
          <span><ShieldCheck size={14} /> {owned ? 'Already in your library' : 'One-time payment · Yours to keep'}</span></div>
      </div>
    </div>
  </main>;
}

function Poster({ film }) {
  const posterClass = `poster-art poster-art-${film.posterTone}`;
  return <div className={posterClass}><div className="poster-orb" /><div className="poster-mountains" /><div className="poster-type"><span>{film.genre.toUpperCase()} · {film.year}</span><strong>{film.title.split(' ').map((word, i) => <span key={i}>{word}</span>)}</strong><small>AN ORIGINAL FILM</small></div><div className="poster-number">RB — {String(film.year).slice(-2)}</div></div>;
}

function Library({ user, onSignIn, onToast }) {
  const [films, setFilms] = useState([]); const [loading, setLoading] = useState(Boolean(user));
  const [searchParams, setSearchParams] = useSearchParams();
  const paymentSuccess = searchParams.get('payment') === 'success';
  useEffect(() => {
    if (!user) return;
    let cancelled = false; let timer; let attempts = 0;
    const loadLibrary = async () => {
      try {
        const data = await api('/library');
        if (cancelled) return;
        setFilms(data.media);
        if (paymentSuccess && !data.media.length && attempts < 8) { attempts += 1; timer = setTimeout(loadLibrary, 1500); }
        else { if (paymentSuccess && data.media.length) setSearchParams({}, { replace: true }); setLoading(false); }
      } catch (error) { if (!cancelled) { onToast(error.message); setLoading(false); } }
    };
    loadLibrary();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [user, paymentSuccess, onToast, setSearchParams]);
  if (!user) return <main className="library-empty"><div className="empty-icon"><Film size={25} /></div><div className="eyebrow">YOUR PERSONAL CINEMA</div><h1>Your library<br />is waiting.</h1><p>Sign in to find the films you’ve made yours.</p><button className="button button-primary" onClick={onSignIn}>Sign in to your account <ArrowRight size={16} /></button></main>;
  return <main className="library-page section-wrap"><div className="eyebrow">YOUR PERSONAL CINEMA <span className="heading-line" /></div><h1>The films <em>you keep.</em></h1><p className="library-lead">Your collection, ready whenever you are.</p>{loading && paymentSuccess && <p className="payment-pending">Confirming your payment securely…</p>}{loading ? <div className="loading-grid">{[1, 2].map((n) => <div className="skeleton" key={n} />)}</div> : films.length ? <div className="film-grid library-grid">{films.map((film, i) => <FilmCard key={film.id} film={film} index={i} owned onPurchase={() => {}} />)}</div> : <div className="empty-library"><div className="empty-icon"><Clapperboard size={23} /></div><h2>Nothing in the credits yet.</h2><p>When you find a film you love, it’ll be waiting here.</p><Link to="/" className="button button-primary">Browse the collection <ArrowRight size={16} /></Link></div>}</main>;
}

function Watch({ user, onSignIn, onToast }) {
  const { id } = useParams(); const [film, setFilm] = useState(null); const [video, setVideo] = useState(''); const [loading, setLoading] = useState(true);
  useEffect(() => { if (!user) { setLoading(false); return; } Promise.all([api(`/media/${id}`), api(`/media/${id}/play`)]).then(([detail, playback]) => { setFilm(detail.media); setVideo(playback.url); }).catch((e) => onToast(e.message)).finally(() => setLoading(false)); }, [id, user]);
  if (!user) return <main className="library-empty"><div className="eyebrow">YOUR NEXT SCREENING</div><h1>Sign in to<br />start watching.</h1><button className="button button-primary" onClick={onSignIn}>Sign in <ArrowRight size={16} /></button></main>;
  if (loading) return <main className="watch-page"><div className="video-frame skeleton" /></main>;
  if (!video) return <main className="watch-error"><div className="empty-icon"><ShieldCheck size={23} /></div><h1>Not in your collection.</h1><p>Buy this film first, and it’ll be ready to stream here.</p><Link className="button button-primary" to="/">Explore films <ArrowRight size={16} /></Link></main>;
  return <main className="watch-page"><Link to="/library" className="back-link"><ArrowLeft size={15} /> Back to your library</Link><div className="video-frame"><video controls autoPlay playsInline src={video} poster="" onError={() => onToast('Could not load this video. The storage link may have expired or the file may be unavailable.')} /></div><div className="watch-caption"><div><div className="eyebrow">NOW PLAYING · {film?.genre?.toUpperCase()}</div><h1>{film?.title}</h1><p>{film?.description}</p></div><span className="private-badge"><ShieldCheck size={14} /> PRIVATE STREAM</span></div></main>;
}

function titleFromFile(fileName) {
  return fileName.replace(/\.[^.]+$/, '').replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function displayDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'Unknown duration';
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

function AdminUpload({ user, onSignIn, onAdmin, onCreated }) {
  const [file, setFile] = useState(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState('Unknown duration');
  const [price, setPrice] = useState('49');
  const [description, setDescription] = useState('');
  const [genre, setGenre] = useState('Independent');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function chooseFile(event) {
    const selected = event.target.files?.[0] || null;
    setFile(selected);
    setError('');
    if (!selected) return;
    setTitle(titleFromFile(selected.name));
    setYear(String(new Date().getFullYear()));
    setDescription('');
    setDuration('Reading video length…');
    const url = URL.createObjectURL(selected);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => { setDuration(displayDuration(video.duration)); URL.revokeObjectURL(url); };
    video.onerror = () => { setDuration('Unknown duration'); URL.revokeObjectURL(url); };
    video.src = url;
  }

  async function enableAdmin() {
    setBusy(true); setError('');
    try { const result = await api('/admin/bootstrap', { method: 'POST', body: JSON.stringify({}) }); onAdmin(result.user); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const contentType = file.type || 'video/mp4';
      const signed = await api('/admin/uploads/presign', { method: 'POST', body: JSON.stringify({ fileName: file.name, contentType, size: file.size }) });
      const uploaded = await fetch(signed.uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: file });
      if (!uploaded.ok) throw new Error('The video upload did not finish. Check S3 permissions and try again.');
      const result = await api('/admin/media', { method: 'POST', body: JSON.stringify({ title, description, genre, year, duration, price, storageKey: signed.storageKey }) });
      onCreated(result.media);
      setFile(null); setTitle(''); setDuration('Unknown duration'); setFileInputKey((current) => current + 1);
    } catch (requestError) { setError(requestError.message || 'The video could not be added. Please try again.'); }
    finally { setBusy(false); }
  }

  if (!user) return <main className="admin-page section-wrap"><div className="eyebrow">VIDBOX STUDIO</div><h1>Sign in to add a film.</h1><button className="button button-primary" onClick={onSignIn}>Sign in <ArrowRight size={16} /></button></main>;

  if (!user.isAdmin) return <main className="admin-page section-wrap"><div className="eyebrow">ONE-TIME SETUP</div><h1>Set up your <em>film uploader.</em></h1><p className="admin-lead">First, add your existing Vidbox sign-in email as <code>ADMIN_EMAIL</code> in the server environment. Then return here and enable uploads for this account. This keeps film uploads limited to your account.</p>{error && <div className="form-error admin-error">{error}</div>}<button className="button button-primary" onClick={enableAdmin} disabled={busy}>{busy ? 'Setting up…' : 'Enable uploads for my account'} <ArrowRight size={16} /></button></main>;

  return <main className="admin-page section-wrap"><div className="eyebrow">VIDBOX STUDIO <span className="heading-line" /></div><h1>Add a film, <em>in one go.</em></h1><p className="admin-lead">Choose the MP4. Vidbox fills in the title and duration, creates a private S3 file name, uploads it, and adds it to the catalog. Each file can be up to 250 MB; the uploader allows up to 1 GB of catalog videos in total.</p><form className="upload-form" onSubmit={submit}>
    <label className="upload-file-field">Video file <input key={fileInputKey} type="file" accept="video/mp4,.mp4" required onChange={chooseFile} /><span>{file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB · ${duration}` : 'Choose an MP4 video (up to 250 MB)'}</span></label>
    <div className="upload-field-grid"><label>Film title<input required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Filled in from the file name" /></label><label>Price in rupees<input required type="number" min="0" max="100000" step="1" value={price} onChange={(event) => setPrice(event.target.value)} /></label><label>Genre<input required maxLength={40} value={genre} onChange={(event) => setGenre(event.target.value)} /></label><label>Release year<input required type="number" min="1888" max={new Date().getFullYear() + 1} value={year} onChange={(event) => setYear(event.target.value)} /></label></div>
    <label>Description <span className="optional-label">optional</span><textarea maxLength={1000} rows="3" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Add a short description, or leave blank for a simple default." /></label>
    <div className="upload-duration"><Film size={15} /> Detected length: {duration}</div>
    {error && <div className="form-error">{error}</div>}
    <button className="button button-primary upload-submit" disabled={busy || !file}>{busy ? 'Uploading video and adding film…' : 'Upload and add to Vidbox'} <Upload size={15} /></button>
    <p className="upload-privacy"><ShieldCheck size={14} /> The video stays private. Viewers receive a temporary watch link only after purchase.</p>
  </form></main>;
}

function AuthModal({ initialMode, onClose, onSuccess }) {
  const [mode, setMode] = useState(initialMode); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event) { event.preventDefault(); setBusy(true); setError(''); try { const result = await api(`/auth/${mode === 'signin' ? 'login' : 'register'}`, { method: 'POST', body: JSON.stringify({ email, password }) }); onSuccess(result); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title"><button className="modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button><span className="auth-icon"><Clapperboard size={20} /></span><div className="eyebrow">WELCOME TO VIDBOX</div><h2 id="auth-title">{mode === 'signin' ? 'Good to have you back.' : 'Your next favourite awaits.'}</h2><p>{mode === 'signin' ? 'Sign in to your personal cinema.' : 'Create an account to collect and watch films.'}</p><form onSubmit={submit}><label>Email address<input autoFocus type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} /></label><label>Password<input type="password" required minLength={mode === 'register' ? 8 : 1} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'} value={password} onChange={(e) => setPassword(e.target.value)} /></label>{error && <div className="form-error">{error}</div>}<button className="button button-primary auth-submit" disabled={busy}>{busy ? 'A moment…' : mode === 'signin' ? 'Sign in' : 'Create your account'} <ArrowRight size={16} /></button></form><div className="auth-switch">{mode === 'signin' ? 'New to Vidbox?' : 'Already have an account?'} <button onClick={() => { setMode(mode === 'signin' ? 'register' : 'signin'); setError(''); }}>{mode === 'signin' ? 'Create an account' : 'Sign in'}</button></div><div className="auth-secure"><ShieldCheck size={13} /> Your account is encrypted and secure</div></section></div>;
}

function Footer() { return <footer className="footer"><Link className="brand footer-brand" to="/"><span className="brand-mark"><Clapperboard size={15} /></span><span>vidbox<span className="brand-period">.</span></span></Link><span>Independent stories. A little closer to home.</span><span>© VIDBOX 2026</span></footer>; }

export default App;
