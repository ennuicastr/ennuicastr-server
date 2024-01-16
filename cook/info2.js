#!/usr/bin/env node
/*
 * Copyright (c) 2020-2023 Yahweasel
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

const fs = require("fs");

let users = {};
let outJSON = false;
for (let ai = 2; ai < process.argv.length; ai++) {
    const arg = process.argv[ai];
    if (arg[0] === "-") {
        switch (arg) {
            case "--json":
                outJSON = true;
                break;
        }
    } else {
        users = JSON.parse("{" +
            fs.readFileSync(`${arg}.ogg.users`, "utf8") +
            "}");
    }
}

const info = {users};

function timeStr(t) {
    let s = Math.floor(t);
    let m = Math.floor(s / 60);
    s = (s % 60).toString().padStart(2, "0");
    const h = Math.floor(m / 60);
    m = (m % 60).toString().padStart(2, "0");
    return h + ":" + m + ":" + s;
}

async function main() {
    // Read the metadata from stdin
    let meta = "";
    process.stdin.on("data", chunk => {
        meta = meta + chunk.toString();
    });
    await new Promise(res => process.stdin.on("end", res));
    meta = meta.trim().split("\n");
    if (meta.length === 1 && meta[0] === "")
        meta = [];

    for (const line of meta) {
        try {
            const c = JSON.parse(line);
            if (c.c !== "text")
                continue;
            if (!info.chat)
                info.chat = [];
            info.chat.push({time: c.t / 48000, text: c.d.text});
        } catch (ex) {}
    }

    // Now output
    if (outJSON) {
        delete users["0"];
        for (let ui = 1; users[ui]; ui++)
            delete users[ui].packetNo;
        process.stdout.write("\"info\":" + JSON.stringify(info) + "\n");
    } else {
        process.stdout.write("Users:\r\n");
        for (let i = 1; users[i]; i++)
            process.stdout.write("\t" + users[i].nick + "\r\n");

        if (info.chat)
            process.stdout.write("\r\n\r\nChat:\r\n");

        for (const line of (info.chat||[])) {
            process.stdout.write("\t" +
                timeStr(line.time) +
                ": " +
                line.text +
                "\r\n");
        }
    }
}

main();
