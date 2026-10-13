# Release rule

Every change that ships to users adds an entry at the top of `RELEASES` in `app.js` (and `APP_VERSION`; tests/releases.test.js checks it):
the new version number, today's date (YYYY-MM-DD), and what changed in plain
words for users, in every language the app supports. After the update the app
shows these notes once ("what's new" sheet: version, date, changes), and the
About/Settings screen shows the current version and the full history.

Version numbers: bug fixes bump the last digit, new features the middle one.

Shared standard for all of Bryan Woo's apps (including new ones):
https://github.com/bryanwoo988/woobrothers.my/blob/main/APP-STANDARDS.md
