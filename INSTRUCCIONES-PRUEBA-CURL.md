# Instrucciones para Probar el Proxy con curl desde el VPS

## Paso 1: Conectarse al VPS

```bash
ssh root@217.216.87.255
# O usar el método que uses normalmente
```

## Paso 2: Ejecutar el comando curl

Copia y pega este comando exacto:

```bash
curl -v -x "http://uae12c98557ca05dd-zone-custom-region-pe-asn-AS6147-session-lbxUwyWbY-sessTime-3:uae12c98557ca05dd@na.proxy.2captcha.com:2334" https://www.google.com
```

## Paso 3: Copiar la salida completa

El comando `-v` (verbose) mostrará toda la información de la conexión. Copia **TODO** el output, especialmente:

- Las líneas que dicen `* Connected to...`
- Las líneas que dicen `* Establish HTTP proxy tunnel to...`
- Cualquier error como `Proxy CONNECT aborted` o similar
- El código de estado final (si llega)

## Paso 4: Probar también con otros sitios

```bash
# Probar con GitHub
curl -v -x "http://uae12c98557ca05dd-zone-custom-region-pe-asn-AS6147-session-lbxUwyWbY-sessTime-3:uae12c98557ca05dd@na.proxy.2captcha.com:2334" https://api.github.com

# Probar con HTTPBin
curl -v -x "http://uae12c98557ca05dd-zone-custom-region-pe-asn-AS6147-session-lbxUwyWbY-sessTime-3:uae12c98557ca05dd@na.proxy.2captcha.com:2334" https://httpbin.org/ip
```

## Paso 5: Enviar resultados a 2Captcha

Copia el output completo y pégalo en el mensaje que está en `MESSAGE-2CAPTCHA-SUPPORT-EN.md` donde dice `[PASTE THE EXACT OUTPUT FROM CURL HERE]`.

## Qué buscar en el output:

✅ **Si funciona:** Verás algo como:
```
* Connected to na.proxy.2captcha.com (IP) port 2334
* Establish HTTP proxy tunnel to www.google.com:443
* Server auth using Basic with user 'uae12c98557ca05dd-zone-custom-...'
> CONNECT www.google.com:443 HTTP/1.1
< HTTP/1.1 200 Connection established
```

❌ **Si falla:** Verás algo como:
```
* Connected to na.proxy.2captcha.com (IP) port 2334
* Establish HTTP proxy tunnel to www.google.com:443
> CONNECT www.google.com:443 HTTP/1.1
* Proxy CONNECT aborted
* Closing connection
curl: (56) Proxy CONNECT aborted
```

O:
```
* Connected to na.proxy.2captcha.com (IP) port 2334
* Establish HTTP proxy tunnel to www.google.com:443
* Recv failure: Connection reset by peer
curl: (56) Recv failure: Connection reset by peer
```

## Script Automatizado

También puedes usar el script `test-proxy-curl-vps.sh`:

```bash
# Subir el script al servidor
scp test-proxy-curl-vps.sh root@217.216.87.255:/tmp/

# Conectarse al servidor
ssh root@217.216.87.255

# Ejecutar el script
bash /tmp/test-proxy-curl-vps.sh
```

Esto ejecutará el comando y mostrará el resultado completo.
