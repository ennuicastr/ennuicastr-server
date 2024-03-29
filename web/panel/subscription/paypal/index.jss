<?JS
/*
 * Copyright (c) 2020-2022 Yahweasel
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

const uidX = await include("../../uid.jss", {verbose: true});
if (!uidX || uidX.level < 2) return;
const uid = uidX.uid;

const s = await include("./s.jss");

if (!request.body || (!request.body.id && !request.body.cancel)) {
    writeHead(500);
    write("{\"success\":false}");
    return;
}

var ret;
try {
    if (request.body.cancel)
        ret = await s.cancelSubscription(uid);
    else
        ret = await s.updateSubscription(uid, "paypal:" + request.body.id, {activateOnly: true});
} catch (ex) {
    writeHead(500, {"content-type": "application/json"});
    write(JSON.stringify({success: false, reason: ex+""}));
    return;
}

writeHead(ret.success?200:500, {"content-type": "application/json"});
write(JSON.stringify(ret));
?>
