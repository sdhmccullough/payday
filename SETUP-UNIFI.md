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

## 2. UniFi side (~5 minutes)

1. **Enable SSH on the console**: UniFi OS → Console Settings → Advanced →
   SSH → enable, set a password.
2. **Create a UniFi API key**: UniFi Network → Settings → **Control Plane →
   Integrations** → Create API Key. Copy it.
3. **Find the site UUID** (from your PC or SSH'd into the UDM):
   ```
   curl -sk -H "X-API-KEY: YOUR_UNIFI_KEY" https://<udm-ip>/proxy/network/integration/v1/sites
   ```
   Copy the `id` UUID from the response.

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

From this repo, copy the two scripts and the config over (replace `<udm-ip>`):

```bash
scp tools/udm/payday-presence.sh tools/udm/config.example root@<udm-ip>:/tmp/
```

Then SSH in (`ssh root@<udm-ip>`) and:

```bash
mkdir -p /data/payday
mv /tmp/payday-presence.sh /data/payday/
mv /tmp/config.example /data/payday/config
chmod 700 /data/payday/payday-presence.sh
vi /data/payday/config        # fill in MAC, HID, SITE_ID, UNIFI_KEY, FB_KEY
sh /data/payday/payday-presence.sh login   # sensor email + password, one time
```

`login` prints the sensor UID again — confirm it matches what you granted in
the app. Only the refresh token is stored (mode 600); the password is not.

Test one cycle while her phone is on the WiFi:

```bash
sh -x /data/payday/payday-presence.sh poll
```

Then check the app: PayDay → Timesheet → today's card should show a
"Detected arrival …" chip within a minute (and the punch banner shows
"Sensor last reported …").

## 5. Start at boot (survives most firmware updates)

Install the community `udm-boot` package once (persists scripts in
`/data/on_boot.d`): follow
[unifios-utilities on-boot-script](https://github.com/unifi-utilities/unifios-utilities/tree/main/on-boot-script).
Then:

```bash
cp /tmp/30-payday-presence.sh /data/on_boot.d/   # or scp it like the others
chmod +x /data/on_boot.d/30-payday-presence.sh
sh /data/on_boot.d/30-payday-presence.sh          # start it now without rebooting
```

Reboot test: restart the UDM, wait five minutes, and confirm the "Sensor
last reported" time in the app is fresh.

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
