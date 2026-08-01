#!/bin/sh
# on_boot.d shim: starts the PayDay presence poller at UDM boot.
# Install to /data/on_boot.d/30-payday-presence.sh (see SETUP-UNIFI.md).
nohup /data/payday/payday-presence.sh run >> /data/payday/boot.log 2>&1 &
