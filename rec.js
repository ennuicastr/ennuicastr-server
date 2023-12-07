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
const net = require("net");
const config = require("./config.js");
const edb = require("./db.js");
const db = edb.db;
const log = edb.log;

// Create a recording using the main server spawning infrastructure
async function rec(rec, opts) {
    opts = opts || {};

    // Check that this user isn't over the simultaneous recording limit (note: 0x30 == finished)
    let recordings = await db.allP("SELECT rid FROM recordings WHERE uid=@UID AND status<0x30;", {
        "@UID": rec.uid
    });
    if (recordings.length >= config.limits.simultaneous)
        return "You may not have more than " + config.limits.simultaneous + " simultaneous recordings.";

    // If we're recording in a room, lock it
    let lobby = null;
    if ("lid" in opts) {
        while (true) {
            try {
                await db.runP("BEGIN TRANSACTION;");

                lobby = await db.getP(
                    "SELECT *, lock > datetime('now') AS locked FROM lobbies2" +
                    " WHERE uid=@UID AND lid=@LID;", {
                    "@UID": rec.uid,
                    "@LID": opts.lid
                });
                if (!lobby) {
                    // Lobby not found! Ignore it.
                    await db.runP("COMMIT;");
                    break;
                }

                // Check for an existing room
                let lrec = await db.getP(
                    "SELECT * FROM recordings WHERE uid=@UID AND rid=@RID;", {
                    "@UID": rec.uid,
                    "@RID": lobby.rid
                });
                if (lrec && lrec.status < 0x30 /* finished */) {
                    // Just give the established recording
                    await db.runP("COMMIT;");
                    return lrec;
                }

                // Check for a lock
                if (lobby.locked) {
                    await db.runP("COMMIT;");
                    await new Promise(res => {
                        setTimeout(res, 500);
                    });
                    continue;
                }

                // Otherwise, lock it
                await db.runP(
                    "UPDATE lobbies2 SET lock=datetime('now', '1 minute')" +
                    " WHERE uid=@UID AND lid=@LID;", {
                    "@UID": rec.uid,
                    "@LID": opts.lid
                });
                await db.runP("COMMIT;");
                break;

            } catch (ex) {
                await db.runP("ROLLBACK;");

            }
        }
    }

    // Prepare to resolve the creation
    let resolve;
    let p = new Promise(function(r) {
        resolve = r;
    });

    // Connect to the server socket
    let sock = net.createConnection(config.sock);
    sock.write(JSON.stringify({c: "rec", r: rec}) + "\n");

    // And wait for the recording to start
    let buf = Buffer.alloc(0);
    sock.on("data", (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        let i;
        for (i = 0; i < buf.length && buf[i] !== 10; i++) {}
        if (i === buf.length) return;
        let msg = buf.slice(0, i);
        buf = buf.slice(i+1);

        try {
            msg = JSON.parse(msg.toString("utf8"));
        } catch (ex) {
            return;
        }

        if (msg.c === "ready") {
            // Ready!
            resolve(msg.r);
        }
    });

    rec = await p;

    // Now update the lobby if applicable
    if (lobby && typeof rec === "object") {
        while (true) {
            try {
                await db.runP(
                    "UPDATE lobbies2 SET rid=@RID, lock=datetime('now', '-1 minute')" +
                    " WHERE uid=@UID AND lid=@LID;", {
                    "@RID": rec.rid,
                    "@UID": rec.uid,
                    "@LID": opts.lid
                });
                break;
            } catch (ex) {}
        }

        // Add the lobby information
        rec.lid = opts.lid;
        rec.lkey = lobby.key;
        rec.lmaster = lobby.master;

        // If the lobby was shared, share the recording
        const lobbyShare = await db.allP(
            "SELECT * FROM lobby_share WHERE lid=@LID AND uid_from=@UID;", {
            "@LID": opts.lid,
            "@UID": rec.uid
        });
        if (lobbyShare.length) {
            while (true) {
                try {
                    await db.runP("BEGIN TRANSACTION;");

                    for (const share of lobbyShare) {
                        await db.runP(
                            `INSERT INTO recording_share
                            (rid, uid_from, uid_to)
                            VALUES
                            (@RID, @UIDF, @UIDT);`, {
                            "@RID": rec.rid,
                            "@UIDF": rec.uid,
                            "@UIDT": share.uid_to
                        });
                    }

                    await db.runP("COMMIT;");
                    break;

                } catch (ex) {
                    await db.runP("ROLLBACK;");
                }
            }
        }
    }

    return rec;
}

// Get the information for this recording
async function get(rid, uid, opts) {
    opts = opts || {};

    // Get the info
    const recInfo = await db.getP("SELECT * FROM recordings WHERE rid=@RID;", {"@RID": rid});
    if (!recInfo)
        return null;

    // Check for permissions
    if (recInfo.uid === uid || opts.noCheck)
        return recInfo;

    // Check for sharing
    const share = await db.getP(
        `SELECT * FROM recording_share WHERE
            rid=@RID AND uid_from=@UIDF AND uid_to=@UIDT`,
        {
            "@RID": rid,
            "@UIDF": recInfo.uid,
            "@UIDT": uid
        });
    if (share)
        return recInfo;
    return null;
}

// Get a (host) URL for a recording
function hostUrl(rec, opts) {
    opts = opts || {};

    // Get the feature flags
    let features = 0;
    if (rec.continuous)
        features |= 1;
    if (rec.rtc)
        features |= 2;
    if (rec.videoRec)
        features |= 4;
    if (rec.transcription)
        features |= 8;
    if (rec.recordOnly)
        features |= 0x100;
    let extra = rec.extra || {};
    if (typeof extra === "string") {
        try {
            extra = JSON.parse(extra);
        } catch (ex) {
            extra = {};
        }
    }
    if (extra.jitsiAudio)
        features |= 0x800;
    if (extra.jitsiVideo)
        features |= 0x1000;
    if (rec.format === "flac")
        features |= 0x10;

    // Make the URL
    let url = config.client +
        "?" + (opts.rid||rec.rid).toString(36) +
        "-" + (opts.key||rec.key).toString(36) +
        "-m" + (opts.master||rec.master).toString(36);
    if (rec.port && !opts.noport)
        url += "-p" + rec.port.toString(36);
    if (features)
        url += "-f" + features.toString(36);
    url += "&quick=1";

    return url;
}

// Delete a recording directly
async function del(rid, uid, opts) {
    opts = opts || {};

    const rec = await db.getP("SELECT * FROM recordings WHERE rid=@RID;", {"@RID": rid});
    if (!rec || rec.uid !== uid || (rec.status < 0x30 && !opts.force)) {
        // Not allowed or not valid
        return false;
    }

    // Delete the files
    for (let footer of [
        "header1", "header2", "data", "users", "info", "captions.tmp",
        "captions"
    ]) {
        try {
            fs.unlinkSync(config.rec + "/" + rid + ".ogg." + footer);
        } catch (ex) {}
    }

    // Then move the row to old_recordings
    while (true) {
        try {
            await db.runP("BEGIN TRANSACTION;");

            // Insert the new row
            if (!opts.forget) {
                await db.runP("INSERT INTO old_recordings " +
                              "( uid,  rid,  name,  init,  start,  end," +
                              "  expiry,  tracks,  cost,  purchased) VALUES " +
                              "(@UID, @RID, @NAME, @INIT, @START, @END," +
                              " @EXPIRY, @TRACKS, @COST, @PURCHASED);", {
                    "@UID": rec.uid,
                    "@RID": rec.rid,
                    "@NAME": rec.name,
                    "@INIT": rec.init,
                    "@START": rec.start,
                    "@END": rec.end,
                    "@EXPIRY": rec.expiry,
                    "@TRACKS": rec.tracks,
                    "@COST": rec.cost,
                    "@PURCHASED": rec.purchased
                });
            }

            // And drop the old
            var wrid = {"@RID": rec.rid};
            await db.runP("DELETE FROM recordings WHERE rid=@RID;", wrid);
            await db.runP("DELETE FROM recording_share WHERE rid=@RID;", wrid);

            await db.runP("COMMIT;");
            break;
        } catch (ex) {
            await db.runP("ROLLBACK;");
        }
    }

    // And log it
    log("recording-delete", JSON.stringify(rec), {rid, uid});

    return true;
}

module.exports = {
    rec, get, hostUrl, del
};
