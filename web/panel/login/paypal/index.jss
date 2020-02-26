<?JS
/*
 * Copyright (c) 2020 Yahweasel
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

return;
await session.init();

const fs = require("fs");
const util = require("util");

const nrc = new (require("node-rest-client-promise")).Client();

const config = require("../config.js");
const login = await include("../login.jss");

// Make sure we're an actual login
if (!request.query.code) {
    writeHead(302, {"location": "/panel/login/"});
    return;
}

// Get an access token
var token = await nrc.postPromise("https://" + config.paypal.api + "/v1/oauth2/token", {
    headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: "Basic " + Buffer.from(config.paypal.clientId + ":" + config.paypal.secret).toString("base64")
    },
    parameters: {grant_type: "authorization_code", code: request.query.code}
});
token = token.data;

if (!("access_token" in token)) {
    write("Failed to connect to Paypal!");
    return;
}

// Get the account ID
var id = await nrc.getPromise("https://" + config.paypal.api + "/v1/identity/oauth2/userinfo?schema=paypalv1.1", {
    headers: {
        "content-type": "application/json",
        authorization: "Bearer " + token.access_token
    }
});
id = id.data;

if (!("user_id" in id)) {
    write("Failed to connect to Paypal!");
    return;
}

// Log in with this ID
await login.login("paypal:" + id.user_id, {name: id.name});

// Redirect to the panel
writeHead(302, {"location": "/panel/"});
?>
