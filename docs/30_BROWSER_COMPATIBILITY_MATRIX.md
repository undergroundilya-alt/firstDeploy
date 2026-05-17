# Browser compatibility matrix

## Desktop

| Browser | Status | Notes |
|---|---:|---|
| Chrome | primary | WebCrypto, canvas, IntersectionObserver, MutationObserver supported |
| Edge | primary | Chromium-based behavior close to Chrome |
| Firefox | supported | Verify ad-probe behavior with extensions |
| Safari macOS | test carefully | Check ITP, storage and cross-origin behaviors |
| Brave | high-risk | Brave Shields may block ad/probe resources |
| Opera | supported | Chromium-based, test built-in blocker |

## Mobile

| Browser | Status | Notes |
|---|---:|---|
| Android Chrome | primary mobile | Adaptive DOM noise enabled |
| Samsung Internet | supported | Test built-in content blockers |
| iOS Safari | test carefully | iOS restrictions and ITP may affect behavior |
| Firefox Android | supported | Check extension/filter behavior |

## Extensions / blockers

| Tool | Test scenario |
|---|---|
| uBlock Origin | network filter, cosmetic filter, DOM removal |
| AdGuard | network + cosmetic filters |
| AdBlock | basic ad resource blocking |
| Brave Shields | browser-level blocking |
| Corporate proxy | blocked ad CDN / rewritten resources |
| VPN / DNS filter | network-level ad resource failure |

## Network conditions

Test with:

- normal broadband;
- slow 3G/4G;
- offline/online transitions;
- background tab return;
- refresh after bfcache restore;
- high latency proxy;
- blocked ad probe but successful neutral ping;
- both neutral and ad probe failing.
