import type { SetupFix } from "./setup-check.ts";
import { VM_PACKAGES } from "./vm-packages.ts";

// Every fix `runnerbox setup fix` can run, as fixed scripts compiled into the bundle. The only
// value put into one is the username, which `fixScript` checks first. Each is safe to run again.
export const FIXES = {
  "mask-sleep": {
    title: "Mask sleep, suspend and hibernate",
    sudo: true,
    script: () => "systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target",
  },
  "wifi-powersave-off": {
    title: "Turn Wi-Fi power saving off",
    sudo: true,
    // Applies when the connection next comes up; reconnecting now could drop this SSH session.
    script: () => `printf '[connection]\\nwifi.powersave = 2\\n' > /etc/NetworkManager/conf.d/wifi-powersave-off.conf
systemctl reload NetworkManager
echo "Wi-Fi power saving turns off when the connection next comes up."`,
  },
  "wifi-all-users": {
    title: "Save the Wi-Fi connection for all users",
    sudo: true,
    script: () => `nmcli -t -f NAME,TYPE connection show --active | while IFS= read -r line; do
  case "$line" in *:802-11-wireless) nmcli connection modify "\${line%:802-11-wireless}" connection.permissions "" ;; esac
done`,
  },
  "vm-tools": {
    title: "Install KVM and libvirt, and let the VM's firewall see bridged traffic",
    sudo: true,
    script: (user: string) => `export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ${VM_PACKAGES.join(" ")}
echo br_netfilter > /etc/modules-load.d/runnerbox.conf
modprobe br_netfilter
echo net.bridge.bridge-nf-call-iptables=1 > /etc/sysctl.d/90-runnerbox.conf
sysctl -q --system
usermod -aG libvirt,kvm ${user}
echo "${user} joins the libvirt and kvm groups from its next login."`,
  },
  "storage-pool": {
    title: "Create libvirt's default storage pool and start it at boot",
    sudo: true,
    script: () => `virsh -c qemu:///system pool-info default >/dev/null 2>&1 || virsh -c qemu:///system pool-define-as default dir --target /var/lib/libvirt/images
virsh -c qemu:///system pool-build default 2>/dev/null || true
virsh -c qemu:///system pool-info default | grep -q '^State: *running' || virsh -c qemu:///system pool-start default
virsh -c qemu:///system pool-autostart default`,
  },
  linger: {
    title: "Start this user's services at boot",
    sudo: true,
    script: (user: string) => `loginctl enable-linger ${user}`,
  },
  "unattended-upgrades": {
    title: "Install security updates by themselves",
    sudo: true,
    script: () => `export DEBIAN_FRONTEND=noninteractive
apt-get install -y unattended-upgrades
printf 'APT::Periodic::Update-Package-Lists "1";\\nAPT::Periodic::Unattended-Upgrade "1";\\n' > /etc/apt/apt.conf.d/20auto-upgrades`,
  },
  "auto-reboot": {
    title: "Restart at 04:00 when an update needs it",
    sudo: true,
    script: () => `printf 'Unattended-Upgrade::Automatic-Reboot "true";\\nUnattended-Upgrade::Automatic-Reboot-Time "04:00";\\n' > /etc/apt/apt.conf.d/52runnerbox-reboot`,
  },
} satisfies Record<string, { title: string; sudo: boolean; script: (user: string) => string }>;

export type FixId = keyof typeof FIXES;

// What a check names as its fix, so its sudo flag always matches the script's.
export const fixFor = (id: FixId): SetupFix => ({ id, sudo: FIXES[id].sudo });

export const isFixId = (id: string): id is FixId => Object.hasOwn(FIXES, id);

// The script a fix runs, with `set -e` so a failed step stops it.
export function fixScript(id: FixId, user: string) {
  if (!/^[a-z_][a-z0-9_-]{0,31}$/.test(user)) throw new Error(`"${user}" isn't a username setup fixes can use.`);
  return `set -eu\n${FIXES[id].script(user)}\n`;
}
