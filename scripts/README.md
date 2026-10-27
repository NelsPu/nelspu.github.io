# Website maintenance

After adding or replacing project/gallery or article images, run:

```powershell
python scripts/prepare-images.py
```

Requires Pillow. The script retains source images, generates WebP widths up to
1920 px under `responsive/`, writes project dimensions to `projects.json`, and
adds responsive image attributes to static HTML. Commit the generated assets
with the pages and data that reference them.

Before publishing:

```powershell
python scripts/check-site.py
node --check main.js
node --test scripts/interactions.test.cjs
node --test scripts/training-timer-core.test.mjs scripts/training-timer-ui.test.mjs
```

Training timer UI tests exercise the actual app event handlers with a deterministic
clock and a small DOM substitute. They cover every timer phase, pause/resume,
skip confirmations, restart/stop, plan switching, adjustment limits and saved
state. These complement browser checks; they do not simulate mobile audio,
screen locking or service worker lifecycle.

GA4 contact events use `contact_click` with `contact_method`,
`contact_location`, and `page_path`. They measure a contact-link click;
they do not confirm that a LINE message or email was sent. No consultation
values, email addresses, or message content are added to these events.
