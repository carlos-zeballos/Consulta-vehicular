# Message for 2Captcha Support (English)

## Complete Message

Hello,

I've tested the ISP Peru proxy with the exact format you recommended, and I'm experiencing a critical issue.

### Configuration Used (as per your instructions):

**Format:** `http://USERNAME:PASSWORD@na.proxy.2captcha.com:2334`
- Port: **2334 (HTTP, not SOCKS5 2333)**
- Username: `uae12c98557ca05dd-zone-custom-region-pe-asn-AS6147-session-lbxUwyWbY-sessTime-3` (with `sessTime=3`)
- Password: `uae12c98557ca05dd`
- Host: `na.proxy.2captcha.com`

### Testing with Node.js/Axios:

I tested with **6 different HTTPS sites** using the exact code you provided:

```javascript
const proxyUrl = 'http://uae12c98557ca05dd-zone-custom-region-pe-asn-AS6147-session-lbxUwyWbY-sessTime-3:uae12c98557ca05dd@na.proxy.2captcha.com:2334';

const httpsAgent = new HttpsProxyAgent(proxyUrl, { 
  rejectUnauthorized: false 
});
const httpAgent = new HttpProxyAgent(proxyUrl);

await axios.get('https://SITE', { 
  httpsAgent, 
  httpAgent 
});
```

**Results:**
- ❌ Google (https://www.google.com) - FAILED
- ❌ GitHub API (https://api.github.com) - FAILED
- ❌ HTTPBin (https://httpbin.org/ip) - FAILED
- ❌ IPify (https://api.ipify.org?format=json) - FAILED
- ❌ Wikipedia (https://es.wikipedia.org) - FAILED
- ❌ MTC (https://rec.mtc.gob.pe/Citv/ArConsultaCitv) - FAILED

**Error:** All sites fail with: `Proxy connection ended before receiving CONNECT response`

### Testing with curl (from VPS):

I also tested directly from my VPS using curl (without Node.js):

```bash
curl -v -x "http://uae12c98557ca05dd-zone-custom-region-pe-asn-AS6147-session-lbxUwyWbY-sessTime-3:uae12c98557ca05dd@na.proxy.2captcha.com:2334" https://www.google.com
```

**Result:** [PASTE THE EXACT OUTPUT FROM CURL HERE]

The curl test also fails, confirming this is not a Node.js/Axios-specific issue.

### Analysis:

**Critical Finding:** The proxy **fails with ALL HTTPS sites**, not just MTC. This indicates the problem is **NOT site-specific** but a general issue with the proxy not responding correctly to the CONNECT method for HTTPS tunnels.

### Environment:

- **VPS IP:** 217.216.87.255
- **Node.js:** v24.11.0
- **Axios:** v1.13.2
- **https-proxy-agent:** v7.0.6
- **http-proxy-agent:** v7.0.2

### Conclusion:

Since the proxy fails with **any HTTPS domain** (tested with Google, GitHub, HTTPBin, IPify, Wikipedia, and MTC), both from Node.js and from curl using the recommended format and port, this appears to be a server-side or network-level issue that only your team can resolve.

According to your knowledge base, there's no additional configuration needed: HTTP port 2334 + format `http://USER:PASS@na.proxy.2captcha.com:2334` is correct. If it doesn't respond to CONNECT with this configuration, it's a problem that needs to be fixed on your server or network level.

Could you please investigate this issue? The proxy is not responding to CONNECT requests for HTTPS tunnels.

Thank you.

---

## Short Version (if preferred)

Hello,

I've tested the ISP Peru proxy with the exact format you recommended (`http://USERNAME:PASSWORD@na.proxy.2captcha.com:2334`).

**Problem:** The proxy **fails with ALL HTTPS sites** (Google, GitHub, HTTPBin, IPify, Wikipedia, MTC), not just MTC. All fail with: `Proxy connection ended before receiving CONNECT response`.

**Testing with curl from VPS:**
```bash
curl -v -x "http://uae12c98557ca05dd-zone-custom-region-pe-asn-AS6147-session-lbxUwyWbY-sessTime-3:uae12c98557ca05dd@na.proxy.2captcha.com:2334" https://www.google.com
```

**Result:** [PASTE CURL OUTPUT HERE]

The curl test also fails, confirming this is not Node.js-specific. The proxy is not responding to CONNECT requests for HTTPS tunnels with any domain.

Since I'm using the correct format (HTTP 2334 + `http://USER:PASS@na.proxy.2captcha.com:2334`) and it fails with curl too, this appears to be a server-side issue.

Could you please investigate?

Thank you.
