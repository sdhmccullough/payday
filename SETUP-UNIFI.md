# PayDay — UniFi presence sensor setup

Turns your UniFi Dream Machine (Pro / SE / Pro Max) into a presence sensor:
when the nanny's phone joins your WiFi, PayDay suggests her arrival time on
today's card; when it leaves, the departure. Suggestions are **never applied
automatically** — you always tap Apply.

The sensor can only write presence timestamps. Database rules prevent it from
reading or writing anything else (pay, history, members).

---

## 1. Firebase side (~10 minutes, one time)

1. **Enable the Email/Password sign-in provider** (this does not affect your
   Google sign-in): [Authentication → Sign-in method](https://console.firebase.google.com/project/payday-daf05/authentication/providers)
   → Email/Password → Enable → Save.
2. **Create the sensor account**: Authentication → Users → **Add user**.
   Email: anything unroutable, e.g. `udm-sensor@payday.invalid`. Password:
   long and random (you'll type it once during step 4 and never store it).
   After creating, **copy the User UID** from the users table.
3. **Create a second API key** (the existing web key rejects requests from
   the UDM by design): [Credentials](https://console.cloud.google.com/apis/credentials?project=payday-daf05)
   → Create credentials → API key. Then edit it:
   - Name it `udm-sensor-key`.
   - Application restrictions: **None**.
   - API restrictions: **Restrict key** → select only **Identity Toolkit API**
     and **Token Service API**. Save.
   (This key can only be used for sign-in calls; the credential that matters
   is the sensor account, and rules limit what its uid can touch.)
4. **Grant the sensor in PayDay**: open the app → Settings → **Presence
   sensor** → paste the sensor's UID → Grant.

## 2. UniFi side (~10 minutes)

**Find the UDM's IP first** — it's almost always your default gateway. On a
PC on your home network: `ipconfig` → "Default Gateway" (typically
`192.168.1.1`). Everything below uses `<udm-ip>` for that address. Browsing
to `https://<udm-ip>` shows a certificate warning — expected (self-signed);
click Advanced → Proceed.

### 2a. Enable SSH on the console

This lives in the **UniFi OS (console) settings**, NOT inside the Network
application — easy to confuse with Network's "Device SSH Authentication,"
which only covers APs and switches, not the console itself.

1. Open `https://<udm-ip>` (or unifi.ui.com → your console) and sign in.
2. From the UniFi OS home screen (the one listing Network/Protect apps),
   click the **gear / Console Settings** (bottom-left on most versions).
3. Scroll to **Advanced** → toggle **SSH** on → **Change Password** to set
   an SSH password. The username is always `root`.
4. Sanity check from your PC: `ssh root@<udm-ip>` → accept the fingerprint
   → enter the SSH password → you should get a Linux shell. Type `exit`.

### 2b. Create the UniFi API key

1. Open the **Network** application (from the console home screen).
2. **Settings (gear) → Control Plane → Integrations** tab.
   (If you don't see "Control Plane," update the Network app — it needs a
   recent 9.x version; older versions had no official API keys.)
3. **Create API Key**, name it `payday-presence`, and **copy it immediately**
   — it's shown only once. This becomes `UNIFI_KEY` in the config.

### 2c. Find the site UUID

From PowerShell on your PC (same network), with your key pasted in:

```
curl.exe -sk -H "X-API-KEY: PASTE_YOUR_KEY_HERE" https://<udm-ip>/proxy/network/integration/v1/sites
```

The JSON response contains `"id":"xxxxxxxx-xxxx-...."` — that UUID is
`SITE_ID` in the config. (There's typically exactly one site, named
"Default".)

## 3. The phone's MAC address

1. UniFi Network → Client Devices → find her phone while it's connected →
   copy the MAC shown there. (Use this, not the MAC printed in the phone's
   settings — phones present a per-network private address.)
2. On her phone, make sure the private address doesn't rotate:
   - **iPhone (iOS 18+)**: Settings → Wi-Fi → ⓘ next to your network →
     Private Wi-Fi Address → **Fixed** (the default on home networks; just
     confirm it isn't "Rotating").
   - **Android**: default is a stable per-network address — nothing to do
     unless developer options enabled "non-persistent MAC randomization".
   - If she ever "forgets" the network and rejoins, the MAC may change —
     update the config (symptom: no suggestions + stale sensor line).

## 4. Install on the UDM

From PowerShell, **in the repo folder** (`cd` to it first), copy all three
files over — you'll be asked for the SSH password each time unless you set
up keys:

```
scp tools/udm/payday-presence.sh tools/udm/config.example tools/udm/30-payday-presence.sh root@<udm-ip>:/tmp/
```

Then `ssh root@<udm-ip>` and run, line by line:

```bash
mkdir -p /data/payday
mv /tmp/payday-presence.sh /data/payday/
mv /tmp/config.example /data/payday/config
chmod 700 /data/payday/payday-presence.sh
vi /data/payday/config
```

In `vi`: arrow to a value, press `i` to edit, replace the placeholder;
`Esc` then `:wq` + Enter saves and quits. Fill in: `NANNY_MAC` (step 3),
`HID` (your household id), `SITE_ID` (step 2c), `UNIFI_KEY` (step 2b),
`FB_KEY` (the udm-sensor key from step 1.3).

Sign the sensor in — one time; it prompts for the sensor account email and
password, stores only a refresh token, and prints the sensor UID (should
match what you granted in the app):

```bash
sh /data/payday/payday-presence.sh login
```

Test one full cycle while her phone (or any phone whose MAC you temporarily
put in the config) is on the WiFi:

```bash
sh -x /data/payday/payday-presence.sh poll
echo $?    # 0 = clean
tail -5 /data/payday/presence.log
```

Then check the app: Timesheet → today's card shows a "Detected arrival …"
chip within a minute, and the punch banner shows "Sensor last reported …".

## 5. Start at boot (survives most firmware updates)

The community-standard boot persistence for UniFi OS 4.x is
[unifi-utilities/unifi-common](https://github.com/unifi-utilities/unifi-common)
— it installs a systemd unit that runs everything in `/data/on_boot.d/` at
startup. Its installer is a pipe-to-shell one-liner; since this runs as root
on your gateway, the careful version is download → skim → run:

```bash
curl -fsL -o /tmp/remote_install.sh "https://raw.githubusercontent.com/unifi-utilities/unifi-common/HEAD/remote_install.sh"
less /tmp/remote_install.sh      # q to quit when satisfied
/bin/bash /tmp/remote_install.sh
```

Then install and start the shim:

```bash
mkdir -p /data/on_boot.d
mv /tmp/30-payday-presence.sh /data/on_boot.d/
chmod +x /data/on_boot.d/30-payday-presence.sh
sh /data/on_boot.d/30-payday-presence.sh     # start now, no reboot needed
```

Confirm it's running: `ps | grep payday` should show the `run` loop, and the
app's "Sensor last reported" should refresh within ~3 minutes.

**Reboot test** (do this once): restart the UDM (Console Settings →
Restart), wait five minutes, confirm "Sensor last reported" is fresh again.

## 6. How it behaves

| Scenario | What happens |
|---|---|
| Phone joins WiFi in the morning | `firstSeenAt` stamped within one poll (~3 min); arrival chip appears |
| Brief WiFi dropout midday | Nothing — gaps under 30 min read as "still here" |
| Phone leaves at 4:30 | Departure chip appears ~30 min later showing 4:30 |
| She returns in the evening (same day) | Last-seen advances; day end = final departure |
| Weekend visit | Presence is recorded; the app only suggests, you just don't apply |
| UDM reboot | Poller restarts via on_boot.d |
| Firmware update | Usually survives; if "Sensor last reported" goes stale, re-run the udm-boot installer and reboot |
| No detections for days | Check her phone's MAC hasn't rotated (step 3), then the log |

Log: `/data/payday/presence.log`. Quiet hours (default 5 AM–11 PM) and all
thresholds are tunable in `/data/payday/config`.

## Security notes & rotation

- On the UDM: the UniFi API key, the auth-only Firebase API key, and the
  sensor's refresh token. Together they can read/write **presence timestamps
  only** — nothing financial.
- To revoke everything: delete the sensor user in Firebase Auth **or** revoke
  its UID in PayDay Settings → Presence sensor; regenerate the UniFi API key
  in Control Plane → Integrations.
- The UDM's clock stamps the times — if suggestions look shifted, check
  `date` on the UDM matches local time.
