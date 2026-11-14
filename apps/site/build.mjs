// Generates the public site (plain HTML, no framework). Run: node apps/site/build.mjs
// Edit the text here, not in the .html files. Deploy the folder to Cloudflare Pages as static files.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const NAME = 'ParkPay'; // working name
const UPDATED = '13 November 2026';
const CONTACT = 'support@parkpay.example'; // placeholder: replace with the real support mailbox before launch

const NAV = [
  ['index.html', 'How it works'],
  ['index.html#operators', 'For operators'],
  ['support.html', 'Support'],
  ['privacy.html', 'Privacy'],
];

function page(file, title, desc, body) {
  const nav = NAV.map(([h, t]) => `<a href="${h}"${h === file ? ' aria-current="page"' : ''}>${t}</a>`).join('\n    ');
  writeFileSync(
    join(here, file),
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${desc}">
<meta name="theme-color" content="#f2f4f1" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0a0f0c" media="(prefers-color-scheme: dark)">
<link rel="stylesheet" href="styles.css">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="nav">
  <a class="logo" href="index.html"><span>P</span>${NAME}</a>
  <nav aria-label="Main">
    ${nav}
  </nav>
</header>
<main id="main">
${body.trim()}
</main>
<footer>
  <span>© 2026 ${NAME} (working name)</span>
  <a href="privacy.html">Privacy</a><a href="terms.html">Terms</a><a href="support.html">Support</a><a href="delete-account.html">Delete my account</a>
</footer>
</body>
</html>
`,
  );
}

const draft = `<p class="note"><strong>Draft.</strong> This text has not been reviewed by a lawyer. It must be reviewed and completed (company name, address, governing law) before the app is published.</p>`;
const mail = `<a href="mailto:${CONTACT}">${CONTACT}</a>`;

page(
  'index.html',
  `${NAME} - pay for parking from your phone`,
  'Park, pay for exactly the minutes you used, and go. No meters, no coins, no paper tickets.',
  `
<section class="hero">
  <h1>Pay for parking by the minute.</h1>
  <p>${NAME} finds the parking area you are standing in, starts the clock with one tap and charges only for the time you used.</p>
  <div class="row"><a class="cta" href="#how">See how it works</a><a class="cta ghost" href="#operators">For cities and lot owners</a></div>
</section>
<h2 id="how">How it works</h2>
<ol class="steps">
  <li><h3>Arrive</h3><p>The app uses your phone’s location to find the parking area and shows its price right now.</p></li>
  <li><h3>Start</h3><p>Pick your vehicle, choose how long you plan to stay, and tap Start parking.</p></li>
  <li><h3>Get reminded</h3><p>You get a nudge before your time is up, and if you drive away without ending.</p></li>
  <li><h3>End and pay</h3><p>Tap End. You pay for the exact minutes and get a receipt in the app.</p></li>
</ol>
<h2 id="operators">For cities and lot owners</h2>
<div class="two">
  <div><h3>Draw an area, set a price</h3><p>Mark a lot or a street on a map, set rates by day and hour, and publish. Drivers see it within seconds. No meters to install.</p></div>
  <div><h3>Enforce with a phone</h3><p>Officers check a licence plate in the app and see at once whether the vehicle has a valid session.</p></div>
  <div><h3>See what is happening</h3><p>Revenue per day and per area, who is parked now, refunds, tickets, and a log of every change.</p></div>
  <div><h3>Talk to us</h3><p>Running a pilot? Write to ${mail}.</p></div>
</div>
<p class="muted" style="margin-top:32px">${NAME} is in pilot. Payments in the current test version are simulated: no money moves.</p>
`,
);

page(
  'privacy.html',
  `Privacy policy - ${NAME}`,
  `What ${NAME} collects, why, and how to delete it.`,
  `
<article>
<h1>Privacy policy</h1>
<p class="muted">Last updated ${UPDATED}</p>
${draft}
<h2>What we collect</h2>
<ul>
  <li><strong>Account:</strong> your name, email address and an encrypted password.</li>
  <li><strong>Vehicles:</strong> licence plate, region, and optional make, model, colour and size.</li>
  <li><strong>Location:</strong> your position when you open the app, when you start and end a session, and about once a minute while a session is running. If you allow “all the time” location, the app also checks your position in the background to remind you when you reach a parking area or drive away with a session still open.</li>
  <li><strong>Parking sessions:</strong> area, start and end time, fee and receipt number.</li>
  <li><strong>Tickets:</strong> if an officer issues a ticket for your plate, the plate, place, reason and amount.</li>
  <li><strong>Payments:</strong> handled by our payment provider. We store the amount and status, never your full card number.</li>
</ul>
<h2>Why we use it</h2>
<p>To find the parking area you are in, calculate what you owe, show officers that a vehicle has paid, send the reminders you turned on, prevent fraud and keep required financial records.</p>
<h2>What we do not do</h2>
<p>We do not sell your data. We do not use your location for advertising. We do not track you when no parking session is running, except for the arrival reminder if you turned on background location.</p>
<h2>Who sees it</h2>
<ul>
  <li><strong>The parking operator</strong> of the area you park in sees the plate, time and fee of sessions in their areas.</li>
  <li><strong>Enforcement officers</strong> see whether a plate has a valid session.</li>
  <li><strong>Service providers</strong> that run our systems (database hosting, payments, notifications), under contract.</li>
</ul>
<h2>How long we keep it</h2>
<p>Location breadcrumbs: 30 days. Sessions, receipts and tickets: as long as tax and accounting law requires. Account data: until you delete your account.</p>
<h2>Your choices</h2>
<p>You can turn location and notifications off in your phone’s settings; the app then cannot find your area automatically or remind you. You can delete your account in the app (Account, Delete account) or as described on <a href="delete-account.html">Delete my account</a>. You can ask for a copy of your data at ${mail}.</p>
<h2>Contact</h2>
<p>${mail}</p>
</article>
`,
);

page(
  'terms.html',
  `Terms of use - ${NAME}`,
  `The rules for using ${NAME}.`,
  `
<article>
<h1>Terms of use</h1>
<p class="muted">Last updated ${UPDATED}</p>
${draft}
<h2>The service</h2>
<p>${NAME} lets you pay for parking in participating areas. The parking itself is provided by the operator of each area, whose rules and signs still apply.</p>
<h2>Your responsibilities</h2>
<ul>
  <li>Enter the correct licence plate. A session only covers the plate it was started for.</li>
  <li>Check that the area shown in the app is the one you are parked in before you start.</li>
  <li>End your session when you leave. The clock runs until you end it or the maximum stay is reached. Reminders are a convenience and may not always arrive.</li>
  <li>Do not use the app while driving.</li>
</ul>
<h2>Prices and payment</h2>
<p>The fee is calculated by our server from the area’s published rates and the time recorded by the server. The price shown before you start is an estimate for the time you plan. In the current test version payments are simulated and no money moves.</p>
<h2>Tickets</h2>
<p>If you park without a valid session or break an area’s rules, an officer may issue a ticket. Unless stated otherwise, tickets shown in the app are notices from the area’s operator.</p>
<h2>Refunds</h2>
<p>If you believe you were charged incorrectly, contact ${mail} with your receipt number. The operator of the area decides refunds for parking fees.</p>
<h2>Availability</h2>
<p>The app depends on your phone’s location and an internet connection, which can fail. If the app cannot be used, you must pay for parking another way where that is required.</p>
<h2>Changes</h2>
<p>We may update these terms. We will tell you in the app before a change that affects you takes effect.</p>
</article>
`,
);

page(
  'support.html',
  `Support - ${NAME}`,
  `Help with ${NAME}: common questions and how to reach us.`,
  `
<article>
<h1>Support</h1>
<p>Write to ${mail}. Include your receipt number if your question is about a charge.</p>
<h2>The app shows the wrong parking area</h2>
<p>Phone location can be off by 5 to 25 metres, more between tall buildings. Wait a few seconds, pull down to refresh, and check the area name before you start.</p>
<h2>I forgot to end my session</h2>
<p>End it in the app as soon as you can, then write to us with the receipt number and the time you actually left.</p>
<h2>I did not get a reminder</h2>
<p>Check that notifications are allowed for ${NAME}. The “drove away” and “arrived” reminders also need location set to “Allow all the time”.</p>
<h2>I got a ticket but I had paid</h2>
<p>Open History in the app, find the session, share the receipt and send it to us with the ticket details.</p>
<h2>Delete my account</h2>
<p>See <a href="delete-account.html">Delete my account</a>.</p>
</article>
`,
);

page(
  'delete-account.html',
  `Delete my account - ${NAME}`,
  `How to delete your ${NAME} account and what is removed.`,
  `
<article>
<h1>Delete my account</h1>
<h2>In the app</h2>
<ol>
  <li>Open ${NAME} and end any running parking session.</li>
  <li>Go to <strong>Account</strong>.</li>
  <li>Tap <strong>Delete account</strong> and confirm.</li>
</ol>
<h2>Without the app</h2>
<p>Email ${mail} from the address of your account with the subject “Delete my account”. We delete it within 30 days.</p>
<h2>What is deleted</h2>
<p>Your sign-in, name, email, phone number and vehicles are removed or anonymised at once.</p>
<h2>What is kept</h2>
<p>Receipts, payments and tickets are kept without your name for as long as tax and accounting law requires, then deleted.</p>
</article>
`,
);

// ---- password reset --------------------------------------------------------------------------
// The app's "Forgot password?" emails a link that lands here. The page talks to the auth service directly
// with the public (publishable) key; the same values ship inside the app and the console.
function publicEnv() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY) return { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_PUBLISHABLE_KEY };
  for (const f of ['../ops-console/.env', '../mobile/.env']) {
    try {
      const env = Object.fromEntries(
        readFileSync(join(here, f), 'utf8')
          .split(/\r?\n/)
          .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
          .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
      );
      const url = env.VITE_SUPABASE_URL ?? env.EXPO_PUBLIC_SUPABASE_URL;
      const key = env.VITE_SUPABASE_KEY ?? env.EXPO_PUBLIC_SUPABASE_KEY;
      if (url && key) return { url, key };
    } catch {
      /* try the next file */
    }
  }
  return null;
}
const pub = publicEnv();
if (pub) {
  page(
    'reset-password.html',
    `Set a new password - ${NAME}`,
    `Choose a new password for your ${NAME} account.`,
    `
<article>
<h1>Set a new password</h1>
<p id="status" class="muted" role="status">Checking your link…</p>
<form id="form" hidden>
  <p><label for="p1">New password</label><br><input id="p1" type="password" autocomplete="new-password" minlength="8" required></p>
  <p><label for="p2">Repeat it</label><br><input id="p2" type="password" autocomplete="new-password" minlength="8" required></p>
  <p id="err" class="err" role="alert"></p>
  <button class="cta" type="submit">Save password</button>
</form>
</article>
<script type="module">
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
const sb = createClient(${JSON.stringify(pub.url)}, ${JSON.stringify(pub.key)}, { auth: { detectSessionInUrl: true, persistSession: false } });
const status = document.getElementById('status'), form = document.getElementById('form'), err = document.getElementById('err');
const params = new URLSearchParams(location.hash.slice(1) || location.search);
function ready() { status.textContent = 'Choose a new password, at least 8 characters.'; form.hidden = false; document.getElementById('p1').focus(); }
if (params.get('error_description')) {
  status.textContent = 'This link has expired or was already used. Open the app and tap “Forgot password?” again.';
} else {
  sb.auth.onAuthStateChange((event, session) => { if (session && form.hidden) ready(); });
  const { data } = await sb.auth.getSession();
  if (data.session) ready();
  else setTimeout(() => { if (form.hidden) status.textContent = 'This page only works from the link in the password email. Open the app and tap “Forgot password?”.'; }, 4000);
}
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  err.textContent = '';
  const a = document.getElementById('p1').value, b = document.getElementById('p2').value;
  if (a.length < 8) return (err.textContent = 'Use at least 8 characters.');
  if (a !== b) return (err.textContent = 'The two passwords are not the same.');
  const { error } = await sb.auth.updateUser({ password: a });
  if (error) return (err.textContent = error.message);
  await sb.auth.signOut();
  form.hidden = true;
  status.textContent = 'Password saved. Go back to the app and sign in with the new password.';
});
</script>
`,
  );
} else {
  console.log('reset-password.html skipped: no public Supabase URL/key found');
}

console.log('site built: index, privacy, terms, support, delete-account' + (pub ? ', reset-password' : ''));
