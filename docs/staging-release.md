# Staging release

A phone build that talks to a hosted **staging** Supabase project. Stories merge to `main`
as usual; at the end of the day one manual run deploys everything merged so far and
publishes a signed APK. The phone picks the update up through Obtainium.

Workflow: `.github/workflows/release-staging.yml` ("Release to staging"). It runs only from
`main`, one at a time.

## One-time setup

### 1. Staging Supabase project

1. supabase.com → **New project**. Name `fizzix-staging`, region **Southeast Asia
   (Singapore)**, Free plan. Save the **database password** in your password manager.
2. The **project ref** is the 20-character id in the dashboard URL
   (`supabase.com/dashboard/project/<ref>`).
3. supabase.com → **Account → Access Tokens → Generate new token**, name `github-staging`.
   Resource access: `fizzix-staging` only. Permissions (they cannot be changed later):
   **Project** read-write, **Database** read-write, **Application services** read-write,
   **Infrastructure and delivery** read (`config push` reads add-ons), **Account and
   organization** none. Expiry 90 days; when it expires, make a new one and update the
   secret.

Free projects pause after about a week without use; restore from the dashboard if a release
fails to connect.

### 2. Signing key and pepper

Run on your own computer. Keep `fizzix-staging.keystore` and its password safe (password
manager plus one backup). If it is lost, the staging app must be uninstalled once and
installed fresh. It is **not** the Play Store key; that one is made before launch.

Signing key (needs Java's `keytool`, included with Android Studio):

```sh
keytool -genkeypair -v -storetype PKCS12 -keystore fizzix-staging.keystore \
  -alias fizzix-staging -keyalg RSA -keysize 4096 -validity 10000 \
  -dname "CN=Fizzix Staging"
```

No Java? The same key with OpenSSL (macOS, Linux, Git Bash on Windows):

```sh
openssl req -x509 -newkey rsa:4096 -nodes -days 10000 -subj "/CN=Fizzix Staging" \
  -keyout staging-key.pem -out staging-cert.pem
openssl pkcs12 -export -name fizzix-staging -inkey staging-key.pem -in staging-cert.pem \
  -out fizzix-staging.keystore
rm staging-key.pem staging-cert.pem
```

Both ask for a password: that is `STAGING_KEYSTORE_PASSWORD`.

The keystore as one line of base64 (`STAGING_KEYSTORE_BASE64`):

```sh
base64 < fizzix-staging.keystore | tr -d '\n' > keystore.b64        # macOS / Linux / Git Bash
```

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("fizzix-staging.keystore")) > keystore.b64
```

Password pepper for the staging Edge Functions (`STAGING_PASSWORD_PEPPER`). Staging only;
production gets its own, different value:

```sh
openssl rand -hex 32
```

### 3. GitHub secrets

Repository → **Settings → Secrets and variables → Actions → New repository secret**:

| Name                        | Value                             |
| --------------------------- | --------------------------------- |
| `SUPABASE_ACCESS_TOKEN`     | the access token from step 1.3    |
| `STAGING_PROJECT_REF`       | the project ref                   |
| `STAGING_DB_PASSWORD`       | the database password             |
| `STAGING_PASSWORD_PEPPER`   | the `openssl rand -hex 32` output |
| `STAGING_KEYSTORE_BASE64`   | the contents of `keystore.b64`    |
| `STAGING_KEYSTORE_PASSWORD` | the keystore password             |

Then delete `keystore.b64`. Never paste these values anywhere else, including chats.

### 4. Phone

1. Install **Obtainium** (github.com/ImranR98/Obtainium, or F-Droid).
2. **Add app** → `https://github.com/sajithkhan/fizzix---A-L-Physics-App` → Add → Install.
   Android asks once to allow installs from Obtainium.
3. Sign up with a test number from `supabase/config.toml` (e.g. 0770000001, OTP `123456`).
   Staging has no SMS provider, so only test numbers can sign up.

## Every release

1. GitHub → **Actions → Release to staging → Run workflow** (branch `main`). The GitHub
   mobile app has the same button.
2. About 25–30 minutes. The run deploys migrations, auth settings, Edge Function secrets and
   functions, smoke-tests staging, then builds and publishes `staging-<n>`. Release notes
   list the PRs merged since the last release.
3. Obtainium shows the update; tap to install.

## What it changes

- Staging database: migrations plus `supabase/seed.sql` (test numbers only).
- Staging auth: everything in `supabase/config.toml`, including the auth hooks and the
  test OTP numbers. Never point this workflow at the production project.
- The staging app is `lk.fizzix.app.staging`, named "Fizzix Staging", so it can sit beside
  the Play Store app later.

## If a run fails

The run stops at the first failed step and publishes nothing. Missing secrets are named in
the first step. A failed migration leaves staging on the last good state (each migration
runs in its own transaction).
