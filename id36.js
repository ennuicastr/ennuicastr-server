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

/* Base-36 ID generation and enc/decryption */

const words = require("./words.js");

const crypto = require("crypto");
const algo = "aes-256-cbc";

// Generate an ID of the desired length
function genID(len) {
    while (true) {
        let ret = "";
        while (ret.length < len) {
            const part = crypto.randomInt(1679616, 60466176).toString(36);
            if (!words.test(part))
                ret += part;
        }
        ret = ret.slice(0, len);
        if (!words.test(ret))
            return ret;
    }
}

// Generate a 31-bit integer
function genInt() {
    while (true) {
        const ret = crypto.randomInt(0, 2147483648);
        if (!words.test(ret.toString(36)))
            return ret;
    }
}

// Generate an encryption key
function genKey() {
    return crypto.randomBytes(32);
}

function enc(input, key) {
    var iv = crypto.randomBytes(16);
    var e = crypto.createCipheriv(algo, key, iv);
    return Buffer.from(
        iv.toString("binary") + e.update(input, "utf8", "binary") + e.final("binary"),
        "binary"
    );
}

function dec(input, key) {
    var iv = input.slice(0, 16);
    var d = crypto.createDecipheriv(algo, key, iv);
    return d.update(input.slice(16), null, "utf8") + d.final("utf8");
}

module.exports = {
    genID,
    genInt,
    genKey,
    enc,
    dec
};
