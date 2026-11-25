# Deployment

Hosting on Vercel (Hobby, free). DNS stays at Simply.com.

## 1. Vercel project for the hub

1. Vercel → **Add New → Project** → import `MartinNguyen-max/mmaxlab`.
2. The framework preset is detected as **Astro**. Keep the defaults (pnpm is detected from `packageManager`).
3. Deploy. Every PR gets a **preview deploy** automatically.
4. Project → **Analytics** → enable **Web Analytics**. The `<Analytics />` component is already in the layout.

`vercel.json` sets clean URLs, the `www` → apex redirect, long caching for `/_astro/*` and basic security headers.

## 2. Domains

In the Vercel project → **Settings → Domains**, add:

- `mmaxlab.com` (primary)
- `www.mmaxlab.com` (redirects to the apex)

Vercel then shows the exact DNS records. **Use the values Vercel shows.** Typically these are an `A` record for the apex and a `CNAME` for `www`.

## 3. DNS at Simply.com

Simply → your domain → **DNS**:

| Type  | Name              | Value                                                |
| ----- | ----------------- | ---------------------------------------------------- |
| A     | `@` (mmaxlab.com) | IP shown by Vercel                                   |
| CNAME | `www`             | target shown by Vercel (e.g. `cname.vercel-dns.com`) |

Remove any old default `A`/`AAAA` records for `@` and `www` (Simply parking). If CAA records exist, allow `letsencrypt.org`.

## 4. Subdomains for projects

For each project (e.g. Stramin), in **that project's** Vercel project → Domains → add `stramin.mmaxlab.com`. Then at Simply:

| Type  | Name      | Value                  |
| ----- | --------- | ---------------------- |
| CNAME | `stramin` | target shown by Vercel |
| CNAME | `rift`    | target shown by Vercel |

Then update `url` in `src/content/projects/<project>.md` and run `pnpm screenshots <project>`.

## 5. Google Search Console

1. Add a **Domain** property for `mmaxlab.com`.
2. Add the `TXT` record it shows at Simply (Name `@`).
3. After verification, submit the sitemap `https://mmaxlab.com/sitemap-index.xml`.

## Checklist after first deploy

- [ ] `https://mmaxlab.com` loads with HTTPS
- [ ] `https://www.mmaxlab.com` redirects to the apex
- [ ] Share preview works (e.g. paste the link in LinkedIn's Post Inspector)
- [ ] Web Analytics shows visits
