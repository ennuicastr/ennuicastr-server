<?JS
/*
 * Copyright (c) 2024 Yahweasel
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY
 * SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION
 * OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
 * CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */

const config = require("../config.js");
const https = require("node:https");

// Check the referer
{
    const refererUrl = new URL(request.headers.referer);
    refererUrl.search = "";
    const referer = refererUrl.toString();
    let refererOK = false;
    if (referer === `${config.client}` || referer === `${config.client}fs/`)
        refererOK = true;
    if (!refererOK) {
        writeHead(500, {"content-type": "application/json"});
        write(JSON.stringify({error: "Invalid request"}));
        return;
    }
}

// Check the parameters
const query = request.query || request.body;
const qParams = new URLSearchParams();
if (query && typeof query.code === "string" && typeof query.redirectUri === "string") {
    // Initial code request
    qParams.set("grant_type", "authorization_code");
    qParams.set("code", query.code);
    let redirectUri = `${config.client}oauth2-login.html`;
    if (query.redirectUri === `${config.client}fs/oauth2-login.html`)
        redirectUri = query.redirectUri;
    qParams.set("redirect_uri", redirectUri);

} else if (query && typeof query.refreshToken === "string") {
    // Refresh request
    qParams.set("grant_type", "refresh_token");
    qParams.set("refresh_token", query.refreshToken);

} else {
    writeHead(500, {"content-type": "application/json"});
    write(JSON.stringify({error: "Invalid request"}));
    return;

}

// Other (standard) parameters
qParams.set("client_id", config.googleDrive.clientId);
qParams.set("client_secret", config.googleDrive.secret);

// Make the request
const resp = await new Promise(res => {
    const req = https.request(
        "https://oauth2.googleapis.com/token",
        {
            headers: {
                "content-type": "application/x-www-form-urlencoded"
            },
            method: "POST"
        },
        res
    );
    req.write(qParams.toString());
    req.end();
});

writeHead(resp.statusCode);
resp.on("data", write);
await new Promise(res => resp.on("end", res));
?>
