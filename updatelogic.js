/* Getting a new build onto phones that already have the app open.

   An update used to need a pull-to-refresh, or closing and reopening the app —
   and on an iPhone a home-screen app is resumed far more often than relaunched,
   so it could run last week's code for days while the server had moved on.
   People cleared their cache to get past it. The page now checks for a newer
   build when it is opened, when it comes back to the screen, and every quarter
   hour while in use, and these functions decide what that check means. */

/* Whether the index.html live on the server is a newer revision than the one
   this page is running.

   Both are index.html's Last-Modified, which GitHub Pages sets on every
   deploy: the running one from document.lastModified ("MM/DD/YYYY hh:mm:ss",
   local time), the live one from a HEAD request (an HTTP date). This used to
   compare a version number read out of sw.js, so every release had to edit
   sw.js by hand or phones never heard of it; a revision needs nobody to
   remember anything. Only a newer one counts — a rollback is not pushed onto
   phones — and anything unreadable counts as no update. */
function newerRevision(running, live){
  const a = Date.parse(String(running || '')), b = Date.parse(String(live || ''));
  return isFinite(a) && isFinite(b) && b - a >= 1000;
}

/* What to do once a newer build is known to be live.

   apply  — reload now: the app has just been opened or brought back, or the
            user asked (pull to refresh), so nothing is being interrupted
   banner — say a new version is ready, with a button: someone mid-task is
            never yanked out of what they are doing
   defer  — in the background: apply when the app comes back

   "Just" is three seconds — long enough to cover the check itself. */
const JUST_MS = 3000;
function updateAction(s){
  if(s.hidden) return 'defer';
  if(s.asked) return 'apply';
  if(!s.busy && s.sinceVisibleMs <= JUST_MS) return 'apply';
  return 'banner';
}

/* An automatic reload is tried once per version per ten minutes. Without a
   service worker in control — private browsing, a first visit — the browser's
   HTTP cache can serve the old files for up to ten minutes after a deploy
   (GitHub Pages sends max-age=600); reloading again would land on the old
   build, see the new one live, and reload again, in a loop. After one try the
   update is offered instead, and a tap on it always goes through. */
const RETRY_MS = 10 * 60e3;
function mayAutoReload(tried, v, now){
  return !(tried && tried.v === v && now - tried.at < RETRY_MS);
}

if(typeof module !== 'undefined') module.exports = {newerRevision, updateAction, mayAutoReload, JUST_MS};
