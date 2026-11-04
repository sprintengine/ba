#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 24.04 VM for the API (docs/deployment.md). Copy this directory (deploy/server) to
# the VM and run it as root from there:
#
#   scp -r deploy/server root@<vm>:bookanything-setup && ssh root@<vm> bash bookanything-setup/bootstrap.sh
#
# Installs Docker from Ubuntu's archive, creates the `deploy` user that owns /opt/bookanything and runs the updater,
# installs update.sh and its systemd timer (enabled, but it only deploys once .env names a TRACK), copies the env
# templates as starting points, turns on unattended security upgrades and turns off SSH passwords. Safe to rerun:
# existing env files are never overwritten.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_USER=deploy
DEPLOY_PATH=/opt/bookanything

export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q docker.io docker-compose-v2 unattended-upgrades postgresql-client
systemctl enable --now docker

id "$DEPLOY_USER" > /dev/null 2>&1 || adduser --system --group --home "$DEPLOY_PATH" --shell /usr/sbin/nologin "$DEPLOY_USER"
usermod -aG docker "$DEPLOY_USER"
install -d -m 750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$DEPLOY_PATH"

install -m 755 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$here/update.sh" "$DEPLOY_PATH/update.sh"
for pair in compose.env.example:.env backend.env.example:backend.env migrate.env.example:migrate.env; do
  template="${pair%%:*}" target="$DEPLOY_PATH/${pair##*:}"
  [[ -e "$target" ]] || install -m 600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$here/$template" "$target"
done
install -m 644 "$here/bookanything-update.service" "$here/bookanything-update.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now bookanything-update.timer

# Key-only SSH, for the operator: deploys need no SSH at all.
cat > /etc/ssh/sshd_config.d/10-bookanything.conf << 'CONF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
CONF
systemctl reload ssh

# Security updates install themselves (reboots stay manual).
dpkg-reconfigure -f noninteractive unattended-upgrades

# Docker's own log rotation for anything started outside compose.
if [[ ! -f /etc/docker/daemon.json ]]; then
  printf '{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "5" } }\n' > /etc/docker/daemon.json
  systemctl restart docker
fi

echo "Ready. As $DEPLOY_USER, fill in $DEPLOY_PATH/.env, backend.env and migrate.env (sudo -u $DEPLOY_USER nano ...;"
echo "docs/deployment.md). The updater deploys the environment's image within a minute of TRACK and the tag being there."
echo "Follow it: journalctl -fu bookanything-update"
