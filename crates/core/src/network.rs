//! The device's networks as the platform reports them, read-only (decision D99).

use serde::{Deserialize, Serialize};

/// One network the device is connected to.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct NetworkLink {
    pub id: u32,
    /// `wifi`, `cellular`, `vpn`, `ethernet`, `bluetooth` and the like, as the platform names its transports.
    pub transports: Vec<String>,
    /// The network new connections use.
    pub default: bool,
    pub interface: Option<String>,
    pub dns: Vec<String>,
    /// For a VPN: the package that owns it.
    pub owner: Option<String>,
    /// For a VPN: the user id ranges whose traffic it carries, such as `0-99999`.
    pub uids: Vec<String>,
    /// For a VPN: the networks it runs over.
    pub underlying: Vec<u32>,
}

impl NetworkLink {
    pub fn is_vpn(&self) -> bool {
        self.transports.iter().any(|t| t == "vpn")
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct NetworkView {
    pub networks: Vec<NetworkLink>,
    /// `off`, `opportunistic`, or the host name private DNS is set to.
    pub private_dns: Option<String>,
    /// The app Android keeps a VPN always on for; `None` with `always_on_vpn` not in `missing` means none.
    pub always_on_vpn: Option<String>,
    pub lockdown: Option<bool>,
    /// The fields the platform did not give, by name.
    pub missing: Vec<String>,
}

impl NetworkView {
    pub fn vpn_up(&self) -> bool {
        self.networks.iter().any(NetworkLink::is_vpn)
    }

    /// One line for a wait that timed out: what the networks looked like when it last looked.
    pub fn brief(&self) -> String {
        if self.networks.is_empty() {
            return "no network".into();
        }
        self.networks
            .iter()
            .map(|n| {
                let mut s = n.transports.join("+");
                if let Some(owner) = &n.owner {
                    s.push_str(&format!(" of {owner}"));
                }
                if n.default {
                    s.push_str(" (default)");
                }
                s
            })
            .collect::<Vec<_>>()
            .join(", ")
    }
}

/// What `Device::log_wait` reads: lines logged from now on, of `app` when given, until one holds any of `patterns`
/// (ignoring case) or `timeout` passes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LogWait {
    pub app: Option<crate::device::AppId>,
    pub patterns: Vec<String>,
    pub timeout: std::time::Duration,
}

impl LogWait {
    pub fn matches(&self, line: &str) -> bool {
        let line = line.to_lowercase();
        self.patterns
            .iter()
            .any(|p| line.contains(&p.to_lowercase()))
    }
}

/// The matching line, or how many lines arrived without one.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct LogWaited {
    pub line: Option<String>,
    pub seen: usize,
}
