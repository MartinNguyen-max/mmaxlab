# Deployment

The site runs on **Vercel** (free). The domain **mmaxlab.com** is registered at **Simply.com**.
To connect them, you tell Vercel about the domain, and you tell Simply to point the domain at Vercel.

Each step below says where to click, what you will see and what to copy. Allow 15–20 minutes, plus waiting time for DNS.

## Status

- [x] **Step 1.** Vercel project created from the GitHub repo. Every push to `main` deploys automatically.
- [ ] **Step 2.** Add the domain in Vercel.
- [ ] **Step 3.** Add the DNS records at Simply.
- [ ] **Step 4.** Wait, then check that it works.
- [ ] **Step 5.** (Optional) Turn on Web Analytics.
- [ ] **Step 6.** (Optional) Google Search Console.

---

## Step 2: add the domain in Vercel

1. Go to [vercel.com](https://vercel.com) and open the **mmaxlab** project.
2. Click **Settings** in the left menu, then **Domains**.
3. Click **Add Existing** (or **Add Domain**), type `mmaxlab.com` and confirm.
4. Vercel asks whether to also add `www.mmaxlab.com`. Say **yes**.
5. Both domains now appear in the list with a red or orange **Invalid Configuration** label. That is expected: Simply doesn't point to Vercel yet.
6. Make `mmaxlab.com` the main address:
   - Click **Edit** on `www.mmaxlab.com`.
   - Under **Redirect to**, choose `mmaxlab.com` and save.
   - (The repo's `vercel.json` also redirects www → mmaxlab.com, so either way works.)

**Keep this page open.** Click each domain to see the DNS records Vercel wants. You need them in step 3. They look roughly like this, but **copy the exact values Vercel shows you**:

| For domain        | Type  | Name  | Value (example, yours may differ)                |
| ----------------- | ----- | ----- | ------------------------------------------------ |
| `mmaxlab.com`     | A     | `@`   | an IP address, e.g. `76.76.21.21`                |
| `www.mmaxlab.com` | CNAME | `www` | a Vercel address, e.g. `xxxx.vercel-dns-017.com` |

## Step 3: add the DNS records at Simply

1. Log in at [simply.com](https://www.simply.com) and open **mmaxlab.com**.
2. Go to **DNS** (it may be called **DNS settings** or **DNS records**).
3. **Remove what's in the way.** Delete existing records that would clash:
   - any **A** or **AAAA** record with the name `@` (or empty, or `mmaxlab.com`),
   - any record with the name `www`.

   These usually point to Simply's own parking page. Leave **MX** records (email) and **TXT** records alone.

4. **Add record 1 (the main domain):**
   - Type: **A**
   - Name / Host: `@`. If Simply doesn't accept `@`, leave the field empty or write `mmaxlab.com`.
   - Value / Points to: the **IP address from Vercel**
   - TTL: leave the default
5. **Add record 2 (www):**
   - Type: **CNAME**
   - Name / Host: `www`
   - Value / Points to: the **Vercel address from step 2**. If Simply asks for a trailing dot, add one at the end.
   - TTL: leave the default
6. Save.
7. Only if Simply shows **CAA** records: add one that allows `letsencrypt.org` (Vercel's certificates come from Let's Encrypt). If there are no CAA records, skip this.

## Step 4: wait and check

- Go back to **Vercel → Settings → Domains**. Within minutes, sometimes a few hours, the labels turn into **Valid Configuration**, and Vercel then issues the HTTPS certificate by itself.
- DNS can take up to 24–48 hours worldwide, but it is usually much faster.

Checklist:

- [ ] `https://mmaxlab.com` opens the site with a padlock (HTTPS).
- [ ] `https://www.mmaxlab.com` ends up on `https://mmaxlab.com`.
- [ ] Sharing the link (e.g. in a LinkedIn post) shows the preview image.

**If it doesn't work after a few hours:**

| You see                                | Fix                                                                                                         |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Still Simply's parking page            | An old A record for `@` is still there. Delete it.                                                          |
| Vercel says "Invalid Configuration"    | Compare the record values in Simply with Vercel's, character by character. Click **Refresh** in Vercel.     |
| www doesn't work, the main domain does | Check the `www` CNAME: name `www`, value exactly as Vercel shows.                                           |
| Certificate / "not secure" warning     | Wait an hour after the records turn valid. If it persists, look for a CAA record that blocks Let's Encrypt. |

You can check what the world sees at [dnschecker.org](https://dnschecker.org) (type `mmaxlab.com`, choose **A**).

## Step 5 (optional): Web Analytics

In Vercel, open the project, click **Analytics** and then **Enable**. The site already includes the code, so visits show up after the next deploy. It is free and cookieless.

## Step 6 (optional): Google Search Console

This helps Google find the site.

1. Go to [search.google.com/search-console](https://search.google.com/search-console) and add a **Domain** property: `mmaxlab.com`.
2. Google shows a **TXT** record. Add it at Simply (type **TXT**, name `@`, value from Google), then click **Verify** at Google.
3. Under **Sitemaps**, submit `https://mmaxlab.com/sitemap-index.xml`.

## Later: subdomains for projects

Do this only when you want e.g. `stramin.mmaxlab.com` instead of `stramin.vercel.app`.

1. In **that project's** Vercel project (e.g. Stramin), go to **Settings → Domains** and add `stramin.mmaxlab.com`.
2. At Simply, add the **CNAME** that Vercel shows (name `stramin`).
3. In this repo, update `url` in `src/content/projects/stramin.md` and run `pnpm screenshots stramin`.
