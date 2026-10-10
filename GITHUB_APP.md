# Setting up the ReportBond GitHub App

The GitHub App lets maintainers prove they own a repository and lets ReportBond track the private vulnerability reports filed on it (see [PLATFORM.md](PLATFORM.md), phase 1).

Register **one app per environment**: one for testnet and one for mainnet later. Each has its own URL and secrets.

## The quick way: one click

Open **`/setup/github`** on your ReportBond site and click **Create ReportBond GitHub App**. GitHub shows the app with every setting below already filled in; click *Create* there.

- **Locally** (`pnpm dev`): the credentials are written to `.env` for you, and Connect GitHub works straight away. GitHub can't reach `localhost`, so the app is created with webhooks off unless you give the page a tunnel URL (for example from smee.io).
- **On a deployed site:** first set `SETUP_SECRET` to a long random string in the host's environment variables and enter it on the page. The credentials are then shown once; paste them into the host's environment variables, redeploy, and remove `SETUP_SECRET`.

The page refuses to run once an app is configured, so nobody can swap in their own. `pnpm test:github-setup` tests this flow against a mock GitHub.

The rest of this document is the manual way, and a reference for what the app is given.

## 1. Register the app (manual)

Go to **github.com/settings/apps/new**. For an organisation, use its *Settings → Developer settings → GitHub Apps → New GitHub App*.

`APP_URL` below is where ReportBond runs, for example `https://reportbond.vercel.app`.

| Setting | Value |
|---|---|
| GitHub App name | `ReportBond Testnet` (must be unique on GitHub) |
| Homepage URL | `APP_URL` |
| Callback URL | `APP_URL/api/github/callback` |
| Expire user authorization tokens | On |
| Request user authorization (OAuth) during installation | **On**. This is what signs the maintainer in after installing. |
| Enable Device Flow | Off |
| Setup URL | leave empty |
| Redirect on update | On |
| Webhook → Active | On |
| Webhook URL | `APP_URL/api/github/webhook` |
| Webhook secret | a long random string; it goes in `GITHUB_WEBHOOK_SECRET` |

**Repository permissions** (everything else: *No access*):

| Permission | Access | Why |
|---|---|---|
| Metadata | Read-only | Required by GitHub |
| Repository security advisories | **Read and write** | Read private reports; accept or close them after a verdict |
| Contents | Read-only | For the triage agents (phase 4) to read the code |
| Pull requests | Read and write | For the `SECURITY.md` pull request (phase 3); can be added later |

**Account permissions:** none.

**Subscribe to events:** tick **Repository advisory**. Installation events are always sent.

**Where can this GitHub App be installed?** *Any account*, so other maintainers can install it.

Click **Create GitHub App**.

## 2. Collect the credentials

On the app's settings page:

| Value | Where | Environment variable |
|---|---|---|
| App ID | "About" section | `GITHUB_APP_ID` |
| App slug | the last part of the public link `github.com/apps/<slug>` | `GITHUB_APP_SLUG` |
| Client ID | "About" section | `GITHUB_CLIENT_ID` |
| Client secret | *Generate a new client secret* | `GITHUB_CLIENT_SECRET` |
| Private key | *Generate a private key*; downloads a `.pem` file | `GITHUB_APP_PRIVATE_KEY` |
| Webhook secret | the string you chose above | `GITHUB_WEBHOOK_SECRET` |

The private key has to fit on one line in `.env`. Convert it with:

```sh
awk 'NF {sub(/\r/, ""); printf "%s\\n", $0}' reportbond.private-key.pem
```

Paste the output as `GITHUB_APP_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----\n`. On Vercel, you can paste the multi-line key directly instead.

Never commit the key or secrets. `.env` is git-ignored; on Vercel they go in *Project → Settings → Environment Variables*.

## 3. Try it

1. Start the app with the variables set. `GET /api/github/session` should return `"configured": true`.
2. Open **/maintainer** and click **Connect GitHub**. Install the app on a repository you administer.
3. Turn on private vulnerability reporting for that repository (*Settings → Security → Private vulnerability reporting*).
4. Open a pool and pick the repository from the list. The pool page shows "Verified maintainer".
5. From another GitHub account, file a private report on the repository. It appears in the pool's **GitHub reports** panel as *Awaiting deposit*.

**Webhooks and local development:** GitHub can't reach `localhost`, so webhooks only arrive on a deployed app, or through a tunnel such as `smee.io` or `cloudflared`. Point the app's webhook URL at the tunnel while testing. Sign-in works locally, because the callback is a browser redirect. Register a separate app with `http://localhost:3000` URLs for local use.

## Testing without GitHub

`pnpm test:github` runs the whole flow against a mock GitHub on a local chain. It needs the same variables, pointed at the mock, with `GITHUB_API_URL` and `GITHUB_WEB_URL` set to `http://127.0.0.1:4010`. See the header of `app/scripts/test-github.ts`.

## What the app does with its access

- Reads the list of repositories where the signed-in user is an admin; nothing else about the user.
- Receives a webhook when a private vulnerability report is filed, and keeps its ID, link, reporter login and state.
- After a verdict, sets the advisory to *draft* (Valid: accepted) or *closed* (Mistake or Slop).
- It never publishes advisories, never posts publicly, and never reads report contents outside the triage agents (phase 4).
