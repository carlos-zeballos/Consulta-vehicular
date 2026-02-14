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

**Result from VPS:**
```
* Connected to na.proxy.2captcha.com (43.135.141.142) port 2334
* CONNECT tunnel: HTTP/1.1 negotiated
* Proxy auth using Basic with user 'uae12c98557ca05dd-zone-custom-region-pe-asn-AS27843-session-X2RCP1LgE-sessTime-3'
* Establish HTTP proxy tunnel to www.google.com:443
> CONNECT www.google.com:443 HTTP/1.1
> Proxy-Authorization: Basic dWFlMTJjOTg1NTdjYTA1ZGQtem9uZS1jdXN0b20tcmVnaW9uLXBlLWFzbi1BUzI3ODQzLXNlc3Npb24tWDJSQ1AxTGdFLXNlc3NUaW1lLTM6dWFlMTJjOTg1NTdjYTA1ZGQ=
< HTTP/1.1 403 Forbidden
< Content-Type: text/plain; charset=utf-8
< Proxy-Authenticate: Basic realm=""
* CONNECT tunnel failed, response 403
```

**Analysis:** The proxy connects successfully and authentication is sent correctly, but the proxy responds with **403 Forbidden**. This is different from the local error (`Proxy connection ended before receiving CONNECT response`). The 403 suggests:
- The proxy is reachable and accepts the connection
- Authentication credentials are being sent correctly
- But the proxy is rejecting the CONNECT request, possibly due to:
  - IP whitelist restrictions
  - Proxy configuration issues
  - Session/authentication method mismatch

### Analysis:

**Critical Finding:** The proxy **fails with ALL HTTPS sites**, not just MTC. 

**From VPS test:** The proxy connects successfully but responds with **403 Forbidden** to CONNECT requests. This indicates:
- The proxy is reachable and authentication is sent correctly
- But the proxy rejects CONNECT requests, possibly due to IP whitelist, proxy configuration, or session restrictions

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

**Result from VPS:**
```
< HTTP/1.1 403 Forbidden
* CONNECT tunnel failed, response 403
```

The curl test shows the proxy **connects and accepts authentication**, but responds with **403 Forbidden** to CONNECT requests. This suggests the proxy is rejecting the request due to configuration, IP whitelist, or session restrictions rather than a connection/authentication issue.

Since I'm using the correct format (HTTP 2334 + `http://USER:PASS@na.proxy.2captcha.com:2334`) and it fails with curl too, this appears to be a server-side issue.

Could you please investigate?

Thank you.
