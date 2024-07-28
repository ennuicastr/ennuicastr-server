/*
 * Copyright (c) 2021, 2022 Yahweasel
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
 
const rte = await import(
    __dirname + "/../../../node_modules/rtennui-server/src/main.js");

const db = require("../db.js").db;
const fs = require("fs");

if (!module.rtes) {
    module.ondisconnect = () => process.exit(0);
    module.rtes = new rte.RTEnnuiServer(acceptLogin);

    // Can't accept any crashes
    process.on("uncaughtException", (err, origin) => {
        fs.writeFileSync("tmp-uncaughtException",
            `Uncaught: ${err}\nOrigin: ${origin}\n`);
    });

    process.on("unhandledRejection", (reason, promise) => {
        fs.writeFileSync("tmp-unhandledRejection",
            `Unhandled: ${promise}\nReason: ${reason}\n`);
    });
}
const rtes = module.rtes;

rtes.acceptConnection(sock);

/**
 * Accept logins from the client.
 * @param credentials  Login credentials
 */
async function acceptLogin(credentials) {
    const id = +credentials.id;

    // Get the recording
    const rec = await db.getP(
        "SELECT * FROM recordings WHERE rid=@RID;", {
        "@RID": id
    });
    if (!rec)
        return null;

    // Check the key
    if (credentials.key !== rec.key)
        return null;

    // Accepted
    return {
        room: id.toString(36),
        info: {uid: credentials.uid ? +credentials.uid : 0}
    };
}
