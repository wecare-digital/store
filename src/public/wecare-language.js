/**
 * WECARE.DIGITAL - on-page translation + read-aloud
 *
 * Talks to the Cloud Run language relay. No Google credentials live in the
 * browser; the relay holds them and is CORS-locked to our own origins.
 *
 * Source is deliberately ASCII-only (native language names use \u escapes) so
 * the file survives any editor or shell that mishandles UTF-8.
 *
 * ---------------------------------------------------------------------------
 * VERIFIED against the live relay on 2026-08-26:
 *
 *   POST {"text": "...", "languageCode": "en-IN"}
 *     -> 200, Content-Type: audio/mpeg, MP3 body.        AUDIO WORKS.
 *
 *   The relay dispatches on BODY KEYS, not on the URL path. A body carrying a
 *   `text` key goes to the speech branch; anything else goes to the translation
 *   branch. `languageCode` only picks the VOICE - the speech branch does not
 *   translate ("Good morning" at en-IN and at hi-IN return byte-identical
 *   audio), so translating first is mandatory for non-English output.
 *
 *   POST {"texts": ["hello"], "targetLanguage": "hi"}
 *     -> 200 {"data":{"translations":[{"translatedText":"...",
 *              "detectedSourceLanguage":"en","model":"nmt"}]}}
 *                                                        TRANSLATION WORKS.
 *
 *   The two branches do NOT share a naming style: speech wants `languageCode`,
 *   translation wants `targetLanguage`. Mixing them up silently fails, because
 *   a missing parameter and a dead service produce the same generic message
 *   ("Translation unavailable" / "Audio unavailable"). An earlier pass read
 *   that message across ~40 request shapes and concluded the endpoint was down;
 *   it was not, the pairing was simply never hit. Treat those strings as
 *   "bad request" first and an outage second.
 *
 *   `sourceLanguage` must be a real code. Passing "auto" is rejected with 400.
 *   Omit the field entirely to auto-detect - the reply then carries
 *   `detectedSourceLanguage`.
 * ---------------------------------------------------------------------------
 */

import wixWindow from 'wix-window-frontend';
import wixLocation from 'wix-location-frontend';

const VERSION = 'v1';
const RELAY = 'https://wecare-translation-relay-hrkl3sncxq-el.a.run.app';

/** Relay CORS allow-list. Anywhere else (Wix editor preview, *.wixsite.com,
 *  stack.wecare.digital) gets a 403, so we stay hidden instead of rendering a
 *  control that cannot work. */
const ALLOWED_HOSTS = [ 'wecare.digital', 'www.wecare.digital' ];

const LS_LANG = 'wc:lang';
const SS_CAPS = 'wc:lang:caps';

/** Google TTS caps a request at 5000 bytes. 900 chars keeps us well inside
 *  that even for multi-byte scripts, and keeps time-to-first-audio short. */
const MAX_CHUNK_CHARS = 900;
/** Hard ceiling on how much of a page we will read aloud. Every character is a
 *  billable Cloud TTS character, and the relay is unauthenticated, so this is
 *  a cost guard as much as a UX one. */
const MAX_READ_CHARS = 3000;
/** Skip nodes shorter than this when translating - mostly icon glyphs. */
const MIN_TRANSLATABLE = 2;

/**
 * Translation request limits, measured against the live relay rather than
 * guessed. Two independent caps apply and either one will reject the whole
 * batch with the same generic 400:
 *
 *   item count : 32 accepted, 35 rejected
 *   total size : 10 x 500 chars accepted, 10 x 900 chars rejected
 *
 * A rejection arrives in about 95ms against roughly 600ms for real work, which
 * is the tell that it is input validation and not the service failing. These
 * values sit well under both ceilings so a page of long paragraphs cannot trip
 * the size cap while still passing the count check.
 */
const MAX_BATCH_ITEMS = 20;
const MAX_BATCH_CHARS = 4000;

/**
 * `code` is the translation target, `voice` the Cloud TTS languageCode.
 * `native` is escaped so this file stays ASCII.
 */
const LANGUAGES = [
  { code: 'en', voice: 'en-IN', label: 'English', native: 'English' },
  { code: 'hi', voice: 'hi-IN', label: 'Hindi', native: '\u0939\u093f\u0928\u094d\u0926\u0940' },
  { code: 'bn', voice: 'bn-IN', label: 'Bengali', native: '\u09ac\u09be\u0982\u09b2\u09be' },
  { code: 'ta', voice: 'ta-IN', label: 'Tamil', native: '\u0ba4\u0bae\u0bbf\u0bb4\u0bcd' },
  { code: 'te', voice: 'te-IN', label: 'Telugu', native: '\u0c24\u0c46\u0c32\u0c41\u0c17\u0c41' },
  { code: 'mr', voice: 'mr-IN', label: 'Marathi', native: '\u092e\u0930\u093e\u0920\u0940' },
  { code: 'gu', voice: 'gu-IN', label: 'Gujarati', native: '\u0a97\u0ac1\u0a9c\u0ab0\u0abe\u0aa4\u0ac0' },
  { code: 'kn', voice: 'kn-IN', label: 'Kannada', native: '\u0c95\u0ca8\u0ccd\u0ca8\u0ca1' },
  { code: 'ml', voice: 'ml-IN', label: 'Malayalam', native: '\u0d2e\u0d32\u0d2f\u0d3e\u0d33\u0d02' },
  { code: 'pa', voice: 'pa-IN', label: 'Punjabi', native: '\u0a2a\u0a70\u0a1c\u0a3e\u0a2c\u0a40' },
  { code: 'ur', voice: 'ur-IN', label: 'Urdu', native: '\u0627\u0631\u062f\u0648' }
];

const SKIP_TAGS = new Set( [
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'SVG', 'CANVAS', 'VIDEO', 'AUDIO',
  'INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'CODE', 'PRE', 'HEAD', 'META', 'LINK'
] );

/** Wix renders page content into one of these; fall back to <body>. */
const CONTENT_ROOTS = [
  'main', '[role="main"]', '#PAGES_CONTAINER', '#SITE_PAGES', '#masterPage', '#SITE_CONTAINER'
];

/**
 * z-index 1000 is deliberate, not arbitrary. The live site's stylesheet puts
 * `.fullScreenOverlay` - which backs Wix lightboxes, the side cart and the
 * mobile hamburger - at z-index 1005, and pinned page elements around 47. So
 * 1000 sits above ordinary content and pinned items while still letting every
 * Wix overlay cover us. A bigger value (99900 was the first attempt) leaves
 * this button floating on top of open popups.
 *
 * Bottom-right is free: the live page has no Wix Chat and no floating WhatsApp
 * button - the only wa.me/whatsapp strings in the markup belong to an analytics
 * click-classifier, and the sole `floating` hit is the
 * `floatingUICountryDropdown` experiment flag.
 */
const CSS = `
.wc-lang{position:fixed;right:16px;bottom:16px;z-index:1000;font-family:inherit;
  display:flex;flex-direction:column;align-items:flex-end;gap:8px}
.wc-lang *{box-sizing:border-box}
.wc-lang__bar{display:flex;align-items:center;gap:6px;background:#fff;border:1px solid #d8ded9;
  border-radius:13px;box-shadow:0 4px 16px rgba(16,32,24,.14);padding:6px}
.wc-lang__btn{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:8px 12px;
  border:0;border-radius:9px;background:#f4f7f5;color:#1a3a2a;font-size:14px;font-weight:600;
  line-height:1;cursor:pointer}
.wc-lang__btn:hover:not(:disabled){background:#e6ece8}
.wc-lang__btn:focus-visible{outline:3px solid #1a3a2a;outline-offset:2px}
.wc-lang__btn[aria-pressed="true"]{background:#1a3a2a;color:#fff}
.wc-lang__btn:disabled{opacity:.5;cursor:not-allowed}
.wc-lang__btn svg{flex:0 0 auto}
.wc-lang__menu{display:none;max-height:min(60vh,380px);overflow-y:auto;background:#fff;
  border:1px solid #d8ded9;border-radius:13px;box-shadow:0 8px 28px rgba(16,32,24,.18);
  padding:6px;min-width:196px}
.wc-lang__menu[data-open="true"]{display:block}
.wc-lang__opt{display:flex;justify-content:space-between;gap:12px;width:100%;min-height:40px;
  padding:9px 11px;border:0;border-radius:9px;background:transparent;color:#1a3a2a;
  font-size:14px;text-align:left;cursor:pointer}
.wc-lang__opt:hover{background:#f4f7f5}
.wc-lang__opt:focus-visible{outline:3px solid #1a3a2a;outline-offset:-3px}
.wc-lang__opt[aria-current="true"]{background:#1a3a2a;color:#fff;font-weight:600}
.wc-lang__opt span:last-child{opacity:.7;font-size:13px}
.wc-lang__sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;
  clip:rect(0 0 0 0);white-space:nowrap;border:0}
.wc-lang--busy .wc-lang__spin{animation:wc-lang-spin 1s linear infinite;transform-origin:50% 50%}
@keyframes wc-lang-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.wc-lang__spin{animation:none}}
@media (max-width:600px){.wc-lang{right:10px;bottom:10px}.wc-lang__btn{padding:8px 10px;font-size:13px}}
@media print{.wc-lang{display:none}}
`;

const ICON_SPEAK =
  '<svg class="wc-lang__spin" width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
  '<path d="M11 5 6 9H3v6h3l5 4V5Z" stroke="currentColor" stroke-width="1.7" ' +
  'stroke-linecap="round" stroke-linejoin="round"/>' +
  '<path d="M16 9a4 4 0 0 1 0 6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>' +
  '</svg>';

const ICON_STOP =
  '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
  '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>';

const ICON_GLOBE =
  '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
  '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/>' +
  '<path d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18" ' +
  'stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';

// ---------------------------------------------------------------------------
// relay
// ---------------------------------------------------------------------------

function relayPost ( body, signal )
{
  return fetch( RELAY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify( body ),
    signal,
    // The relay authorises by Origin. Sending cookies would only add a
    // credentialed-request constraint for no benefit.
    credentials: 'omit',
    cache: 'no-store'
  } );
}

/** MP3 Blob for one chunk, or null. */
async function synthesize ( text, voice, signal )
{
  try
  {
    const r = await relayPost( { text, languageCode: voice }, signal );
    if ( !r.ok ) return null;
    const ct = r.headers.get( 'content-type' ) || '';
    if ( ct.indexOf( 'audio' ) === -1 ) return null;
    const blob = await r.blob();
    return blob && blob.size > 0 ? blob : null;
  } catch
  {
    return null;
  }
}

/**
 * Translate a batch of strings. Returns an array the same length as `strings`,
 * or null if unavailable.
 *
 * Exactly the relay's contract, verified live: `texts` plus `targetLanguage`.
 * Note there is no `text` key - that would route the request to the speech
 * branch instead. `sourceLanguage` is only sent when we actually know it, since
 * the literal "auto" is rejected with 400; omitting it triggers detection.
 */
async function translateBatch ( strings, target, source, signal )
{
  if ( !strings.length ) return [];
  try
  {
    const payload = { texts: strings, targetLanguage: target };
    if ( source && source !== 'auto' ) payload.sourceLanguage = source;
    const r = await relayPost( payload, signal );
    if ( !r.ok ) return null;
    const json = await r.json().catch( () => null );
    const out = pickTranslations( json );
    if ( !out || out.length !== strings.length ) return null;
    return out;
  } catch
  {
    return null;
  }
}

/** Pull translated strings out of any of the plausible response envelopes. */
function pickTranslations ( json )
{
  if ( !json ) return null;

  const fromList = ( list ) =>
  {
    if ( !Array.isArray( list ) ) return null;
    const out = list.map( ( item ) =>
    {
      if ( typeof item === 'string' ) return item;
      if ( item && typeof item === 'object' )
      {
        return item.translatedText || item.translated || item.text || item.output || null;
      }
      return null;
    } );
    return out.every( ( v ) => typeof v === 'string' ) ? out : null;
  };

  // Google v2: { data: { translations: [...] } }
  if ( json.data && json.data.translations )
  {
    const v = fromList( json.data.translations );
    if ( v ) return v;
  }
  // Google v3: { translations: [...] }
  const v3 = fromList( json.translations );
  if ( v3 ) return v3;
  // Bare arrays and common relay conveniences.
  for ( const key of [ 'result', 'results', 'translated', 'texts', 'output', 'data' ] )
  {
    const v = fromList( json[ key ] );
    if ( v ) return v;
  }
  const bare = fromList( json );
  if ( bare ) return bare;
  // Single-string replies.
  for ( const key of [ 'translatedText', 'translation', 'text', 'result', 'output' ] )
  {
    if ( typeof json[ key ] === 'string' ) return [ json[ key ] ];
  }
  return null;
}

/**
 * Ask the relay what actually works right now, once per tab.
 * Speech is probed with the shortest possible real request; translation with a
 * single word. Cached so a broken branch is not re-probed on every page view.
 */
async function probeCapabilities ()
{
  try
  {
    const cached = sessionStorage.getItem( SS_CAPS );
    if ( cached )
    {
      const p = JSON.parse( cached );
      if ( p && typeof p.tts === 'boolean' && typeof p.translate === 'boolean' ) return p;
    }
  } catch { /* sessionStorage can be blocked; probe live instead */ }

  const caps = { tts: false, translate: false };
  try
  {
    const [ audio, text ] = await Promise.all( [
      synthesize( 'ok', 'en-IN' ),
      translateBatch( [ 'hello' ], 'hi', 'en' )
    ] );
    caps.tts = !!audio;
    caps.translate = Array.isArray( text ) && text.length === 1 && !!text[ 0 ];
  } catch { /* leave both false */ }

  try { sessionStorage.setItem( SS_CAPS, JSON.stringify( caps ) ); } catch { }
  return caps;
}

// ---------------------------------------------------------------------------
// page text
// ---------------------------------------------------------------------------

function contentRoot ()
{
  for ( const sel of CONTENT_ROOTS )
  {
    try
    {
      const el = document.querySelector( sel );
      if ( el ) return el;
    } catch { }
  }
  return document.body;
}

function isSkippable ( node )
{
  let el = node.parentElement;
  let depth = 0;
  while ( el && depth < 40 )
  {
    if ( SKIP_TAGS.has( el.tagName ) ) return true;
    if ( el.classList && el.classList.contains( 'wc-lang' ) ) return true;
    if ( el.getAttribute && el.getAttribute( 'aria-hidden' ) === 'true' ) return true;
    el = el.parentElement;
    depth += 1;
  }
  return false;
}

/** Visible, translatable text nodes under `root`, in document order. */
function collectTextNodes ( root )
{
  const nodes = [];
  let walker;
  try
  {
    walker = document.createTreeWalker( root, NodeFilter.SHOW_TEXT, {
      acceptNode ( node )
      {
        const raw = node.nodeValue;
        if ( !raw ) return NodeFilter.FILTER_REJECT;
        const t = raw.trim();
        if ( t.length < MIN_TRANSLATABLE ) return NodeFilter.FILTER_REJECT;
        // Pure punctuation, digits or symbols: nothing to translate.
        if ( !/[A-Za-z\u0900-\u0DFF\u0600-\u06FF]/.test( t ) ) return NodeFilter.FILTER_REJECT;
        if ( isSkippable( node ) ) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    } );
  } catch
  {
    return nodes;
  }
  let n = walker.nextNode();
  while ( n )
  {
    nodes.push( n );
    n = walker.nextNode();
  }
  return nodes;
}

function readablePageText ()
{
  const parts = [];
  let total = 0;
  const title = document.querySelector( 'h1' );
  if ( title && title.textContent )
  {
    const t = title.textContent.replace( /\s+/g, ' ' ).trim();
    if ( t ) { parts.push( t ); total += t.length; }
  }
  for ( const node of collectTextNodes( contentRoot() ) )
  {
    if ( total >= MAX_READ_CHARS ) break;
    const t = ( node.nodeValue || '' ).replace( /\s+/g, ' ' ).trim();
    if ( !t ) continue;
    if ( parts.length && parts[ parts.length - 1 ] === t ) continue; // Wix duplicates nodes
    parts.push( t );
    total += t.length + 1;
  }
  return parts.join( '. ' ).slice( 0, MAX_READ_CHARS );
}

/**
 * Split into speakable chunks on sentence boundaries. \u0964 is the danda.
 *
 * Deliberately match-based rather than a lookbehind split: a `(?<=...)` regex
 * literal is a parse-time SyntaxError on Safari below 16.4, which would take
 * down the whole Velo bundle instead of just this widget.
 */
function chunkText ( text )
{
  const chunks = [];
  const sentences = text.match( /[^.!?\u0964]+[.!?\u0964]*\s*/g ) || [ text ];
  let buf = '';
  for ( const s of sentences )
  {
    const piece = s.trim();
    if ( !piece ) continue;
    if ( piece.length > MAX_CHUNK_CHARS )
    {
      if ( buf ) { chunks.push( buf ); buf = ''; }
      for ( let i = 0; i < piece.length; i += MAX_CHUNK_CHARS )
      {
        chunks.push( piece.slice( i, i + MAX_CHUNK_CHARS ) );
      }
      continue;
    }
    if ( ( buf + ' ' + piece ).trim().length > MAX_CHUNK_CHARS )
    {
      chunks.push( buf );
      buf = piece;
    } else
    {
      buf = buf ? buf + ' ' + piece : piece;
    }
  }
  if ( buf ) chunks.push( buf );
  return chunks;
}

// ---------------------------------------------------------------------------
// widget
// ---------------------------------------------------------------------------

let styleInjected = false;
let widget = null;
let caps = { tts: false, translate: false };
let currentLang = 'en';
/** node -> original text, so switching back is lossless. */
let originalText = null;
let translating = false;

const player = {
  audio: null,
  queue: [],
  urls: [],
  abort: null,
  playing: false
};

function injectStyle ()
{
  if ( styleInjected ) return;
  try
  {
    if ( document.getElementById( 'wc-lang-css' ) ) { styleInjected = true; return; }
    const s = document.createElement( 'style' );
    s.id = 'wc-lang-css';
    s.textContent = CSS;
    document.head.appendChild( s );
    styleInjected = true;
  } catch { }
}

function announce ( msg )
{
  if ( !widget ) return;
  try { widget.querySelector( '.wc-lang__sr' ).textContent = msg; } catch { }
}

function setBusy ( on )
{
  if ( !widget ) return;
  try { widget.classList.toggle( 'wc-lang--busy', !!on ); } catch { }
}

function langByCode ( code )
{
  return LANGUAGES.find( ( l ) => l.code === code ) || LANGUAGES[ 0 ];
}

function buildWidget ()
{
  const root = document.createElement( 'div' );
  root.className = 'wc-lang';
  root.setAttribute( 'data-wecare-language', VERSION );

  const bar = document.createElement( 'div' );
  bar.className = 'wc-lang__bar';

  // Read aloud
  const speak = document.createElement( 'button' );
  speak.type = 'button';
  speak.className = 'wc-lang__btn wc-lang__speak';
  speak.setAttribute( 'aria-pressed', 'false' );
  speak.setAttribute( 'aria-label', 'Read this page aloud' );
  speak.innerHTML = ICON_SPEAK + '<span>Listen</span>';
  speak.addEventListener( 'click', onSpeakClick );

  // Language menu
  const menu = document.createElement( 'div' );
  menu.className = 'wc-lang__menu';
  menu.id = 'wc-lang-menu';
  menu.setAttribute( 'role', 'menu' );
  menu.setAttribute( 'data-open', 'false' );
  menu.setAttribute( 'aria-label', 'Choose a language' );

  const toggle = document.createElement( 'button' );
  toggle.type = 'button';
  toggle.className = 'wc-lang__btn wc-lang__toggle';
  toggle.setAttribute( 'aria-expanded', 'false' );
  toggle.setAttribute( 'aria-haspopup', 'menu' );
  toggle.setAttribute( 'aria-controls', 'wc-lang-menu' );
  toggle.innerHTML = ICON_GLOBE + '<span class="wc-lang__current">English</span>';
  toggle.addEventListener( 'click', () => setMenuOpen( menu.getAttribute( 'data-open' ) !== 'true' ) );

  for ( const lang of LANGUAGES )
  {
    const opt = document.createElement( 'button' );
    opt.type = 'button';
    opt.className = 'wc-lang__opt';
    opt.setAttribute( 'role', 'menuitem' );
    opt.setAttribute( 'data-code', lang.code );
    opt.setAttribute( 'aria-current', lang.code === currentLang ? 'true' : 'false' );
    opt.innerHTML = '<span></span><span></span>';
    opt.children[ 0 ].textContent = lang.native;
    opt.children[ 1 ].textContent = lang.label;
    opt.addEventListener( 'click', () =>
    {
      setMenuOpen( false );
      selectLanguage( lang.code );
    } );
    menu.appendChild( opt );
  }

  const live = document.createElement( 'div' );
  live.className = 'wc-lang__sr';
  live.setAttribute( 'role', 'status' );
  live.setAttribute( 'aria-live', 'polite' );

  // Translation UI only exists when the relay can actually translate.
  if ( caps.translate ) bar.appendChild( toggle );
  if ( caps.tts ) bar.appendChild( speak );
  root.appendChild( menu );
  root.appendChild( bar );
  root.appendChild( live );

  root.addEventListener( 'keydown', ( e ) =>
  {
    if ( e.key === 'Escape' && menu.getAttribute( 'data-open' ) === 'true' )
    {
      setMenuOpen( false );
      try { toggle.focus(); } catch { }
    }
  } );

  return root;
}

function setMenuOpen ( open )
{
  if ( !widget ) return;
  try
  {
    const menu = widget.querySelector( '.wc-lang__menu' );
    const toggle = widget.querySelector( '.wc-lang__toggle' );
    menu.setAttribute( 'data-open', open ? 'true' : 'false' );
    if ( toggle ) toggle.setAttribute( 'aria-expanded', open ? 'true' : 'false' );
    if ( open )
    {
      const cur = menu.querySelector( '.wc-lang__opt[aria-current="true"]' ) ||
        menu.querySelector( '.wc-lang__opt' );
      if ( cur ) cur.focus();
    }
  } catch { }
}

function onOutsideClick ( e )
{
  if ( !widget ) return;
  try
  {
    if ( !widget.contains( e.target ) ) setMenuOpen( false );
  } catch { }
}

// ---------------------------------------------------------------------------
// read aloud
// ---------------------------------------------------------------------------

function stopPlayback ()
{
  player.playing = false;
  player.queue = [];
  try { if ( player.abort ) player.abort.abort(); } catch { }
  player.abort = null;
  try
  {
    if ( player.audio )
    {
      player.audio.pause();
      player.audio.removeAttribute( 'src' );
      player.audio.load();
    }
  } catch { }
  player.audio = null;
  for ( const u of player.urls ) { try { URL.revokeObjectURL( u ); } catch { } }
  player.urls = [];
  if ( widget )
  {
    try
    {
      const b = widget.querySelector( '.wc-lang__speak' );
      b.setAttribute( 'aria-pressed', 'false' );
      b.setAttribute( 'aria-label', 'Read this page aloud' );
      b.innerHTML = ICON_SPEAK + '<span>Listen</span>';
      b.disabled = false;
    } catch { }
  }
  setBusy( false );
}

function markPlaying ()
{
  if ( !widget ) return;
  try
  {
    const b = widget.querySelector( '.wc-lang__speak' );
    b.setAttribute( 'aria-pressed', 'true' );
    b.setAttribute( 'aria-label', 'Stop reading this page' );
    b.innerHTML = ICON_STOP + '<span>Stop</span>';
  } catch { }
}

async function onSpeakClick ()
{
  if ( player.playing )
  {
    stopPlayback();
    announce( 'Stopped reading.' );
    return;
  }

  const text = readablePageText();
  if ( !text ) { announce( 'Nothing on this page can be read aloud.' ); return; }

  const voice = langByCode( currentLang ).voice;
  const chunks = chunkText( text );
  if ( !chunks.length ) { announce( 'Nothing on this page can be read aloud.' ); return; }

  player.playing = true;
  player.abort = new AbortController();
  const signal = player.abort.signal;
  markPlaying();
  setBusy( true );
  announce( 'Preparing audio.' );

  try
  {
    // Fetch chunk n+1 while chunk n plays, so playback starts after one
    // round-trip instead of after all of them.
    let next = synthesize( chunks[ 0 ], voice, signal );
    for ( let i = 0; i < chunks.length; i += 1 )
    {
      const blob = await next;
      if ( !player.playing ) return;
      next = i + 1 < chunks.length ? synthesize( chunks[ i + 1 ], voice, signal ) : Promise.resolve( null );
      if ( !blob )
      {
        if ( i === 0 ) { announce( 'Audio is unavailable right now.' ); stopPlayback(); return; }
        continue;
      }
      setBusy( false );
      const ok = await playBlob( blob );
      if ( !ok || !player.playing ) return;
    }
    announce( 'Finished reading.' );
  } catch
  {
    announce( 'Audio stopped unexpectedly.' );
  } finally
  {
    if ( player.playing ) stopPlayback();
  }
}

function playBlob ( blob )
{
  return new Promise( ( resolve ) =>
  {
    let url;
    try
    {
      url = URL.createObjectURL( blob );
    } catch
    {
      resolve( false );
      return;
    }
    player.urls.push( url );
    const audio = new Audio( url );
    player.audio = audio;
    let settled = false;
    const done = ( ok ) =>
    {
      if ( settled ) return;
      settled = true;
      try { URL.revokeObjectURL( url ); } catch { }
      resolve( ok );
    };
    audio.addEventListener( 'ended', () => done( true ) );
    audio.addEventListener( 'error', () => done( false ) );
    audio.play().catch( () =>
    {
      // Autoplay policy: the click satisfies it, but a mid-queue clip can
      // still be refused if the tab lost activation.
      announce( 'Playback was blocked by the browser.' );
      done( false );
    } );
  } );
}

// ---------------------------------------------------------------------------
// translate the page
// ---------------------------------------------------------------------------

function snapshotOriginal ( nodes )
{
  if ( originalText ) return;
  originalText = new Map();
  for ( const n of nodes ) originalText.set( n, n.nodeValue );
}

function restoreOriginal ()
{
  if ( !originalText ) return;
  for ( const [ node, value ] of originalText )
  {
    try { if ( node.parentNode ) node.nodeValue = value; } catch { }
  }
}

/**
 * Group nodes into requests that satisfy both relay caps at once.
 *
 * Empty strings are dropped rather than padded: the relay rejects a batch
 * outright if any member is empty, so one blank node would lose the whole
 * group. A single string longer than the size cap can never be sent, so it is
 * dropped too and simply stays in English.
 */
function buildBatches ( nodes )
{
  const batches = [];
  let current = [];
  let chars = 0;

  for ( const node of nodes )
  {
    const text = ( node.nodeValue || '' ).trim();
    if ( !text || text.length > MAX_BATCH_CHARS ) continue;

    if ( current.length >= MAX_BATCH_ITEMS || chars + text.length > MAX_BATCH_CHARS )
    {
      if ( current.length ) batches.push( current );
      current = [];
      chars = 0;
    }
    current.push( { node, text } );
    chars += text.length;
  }
  if ( current.length ) batches.push( current );
  return batches;
}

async function selectLanguage ( code )
{
  if ( translating || code === currentLang ) { updateLangUI( code ); return; }
  const lang = langByCode( code );
  stopPlayback();

  currentLang = code;
  try { localStorage.setItem( LS_LANG, code ); } catch { }
  updateLangUI( code );

  if ( code === 'en' )
  {
    restoreOriginal();
    setDocumentLang( 'en' );
    announce( 'Showing the original English text.' );
    return;
  }

  if ( !caps.translate ) { announce( 'Translation is unavailable right now.' ); return; }

  translating = true;
  setBusy( true );
  announce( 'Translating this page to ' + lang.label + '.' );

  try
  {
    const nodes = collectTextNodes( contentRoot() );
    if ( !nodes.length ) { announce( 'Nothing on this page can be translated.' ); return; }
    snapshotOriginal( nodes );
    restoreOriginal(); // always translate from English, never re-translate

    const batches = buildBatches( nodes );
    if ( !batches.length ) { announce( 'Nothing on this page can be translated.' ); return; }

    let done = 0;
    for ( const batch of batches )
    {
      const out = await translateBatch( batch.map( ( b ) => b.text ), code, 'en' );
      if ( !out )
      {
        // Failing on the very first batch means the capability is gone rather
        // than one awkward batch being rejected, so retire the control instead
        // of leaving a button that does nothing.
        if ( done === 0 )
        {
          caps.translate = false;
          try { sessionStorage.setItem( SS_CAPS, JSON.stringify( caps ) ); } catch { }
          announce( 'Translation is unavailable right now.' );
          currentLang = 'en';
          updateLangUI( 'en' );
          renderInto( document.body );
          return;
        }
        break;
      }
      for ( let k = 0; k < batch.length; k += 1 )
      {
        try { if ( out[ k ] ) batch[ k ].node.nodeValue = out[ k ]; } catch { }
      }
      done += batch.length;
    }
    setDocumentLang( code );
    announce( 'Page translated to ' + lang.label + '.' );
  } catch
  {
    announce( 'Translation failed.' );
  } finally
  {
    translating = false;
    setBusy( false );
  }
}

function setDocumentLang ( code )
{
  try { document.documentElement.setAttribute( 'lang', code ); } catch { }
}

function updateLangUI ( code )
{
  if ( !widget ) return;
  try
  {
    const label = widget.querySelector( '.wc-lang__current' );
    if ( label ) label.textContent = langByCode( code ).native;
    widget.querySelectorAll( '.wc-lang__opt' ).forEach( ( el ) =>
    {
      el.setAttribute( 'aria-current', el.getAttribute( 'data-code' ) === code ? 'true' : 'false' );
    } );
  } catch { }
}

// ---------------------------------------------------------------------------
// lifecycle
// ---------------------------------------------------------------------------

function renderInto ( parent )
{
  try
  {
    const existing = document.querySelector( '.wc-lang' );
    if ( existing && existing.parentNode ) existing.parentNode.removeChild( existing );
  } catch { }
  widget = null;
  if ( !caps.tts && !caps.translate ) return;
  injectStyle();
  widget = buildWidget();
  parent.appendChild( widget );
  updateLangUI( currentLang );
}

function originAllowed ()
{
  try
  {
    return ALLOWED_HOSTS.indexOf( location.hostname ) !== -1;
  } catch
  {
    return false;
  }
}

let started = false;
let listenersBound = false;

export function initLanguage ()
{
  try
  {
    if ( started ) return;
    if ( wixWindow.rendering.env !== 'browser' ) return;
    // The relay 403s any origin outside its allow-list, so on the Wix editor
    // preview or a *.wixsite.com URL there is nothing we could do but render a
    // dead button. Stay out of the way instead.
    if ( !originAllowed() ) return;
    started = true;

    try
    {
      const saved = localStorage.getItem( LS_LANG );
      if ( saved && LANGUAGES.some( ( l ) => l.code === saved ) ) currentLang = saved;
    } catch { }

    probeCapabilities().then( ( c ) =>
    {
      caps = c;
      if ( !caps.tts && !caps.translate ) return;

      const mount = () =>
      {
        renderInto( document.body );
        if ( !listenersBound )
        {
          listenersBound = true;
          try { document.addEventListener( 'click', onOutsideClick, true ); } catch { }
          try
          {
            wixLocation.onChange( () =>
            {
              // New page: stop audio, forget the old DOM snapshot, re-mount.
              stopPlayback();
              originalText = null;
              currentLang = 'en';
              setDocumentLang( 'en' );
              setTimeout( () => renderInto( document.body ), 400 );
            } );
          } catch { }
        }
        // Restore a saved non-English choice once the page has settled.
        if ( currentLang !== 'en' && caps.translate )
        {
          const want = currentLang;
          currentLang = 'en';
          setTimeout( () => selectLanguage( want ), 600 );
        }
      };

      if ( document.readyState === 'loading' )
      {
        document.addEventListener( 'DOMContentLoaded', mount );
      } else
      {
        mount();
      }
    } ).catch( () => { } );
  } catch
  {
    // Never let this feature take down masterPage.js.
  }
}

export default { initLanguage };
