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

const util = require("util");

// Delete all session data and you are now logged out!
await session.init();
const uid = await session.get("uid");
const sd = await session.getAll();
for (const key in sd)
    await session.delete(key);

// Check for a delete-all request
let all = false;
if (request.query && ("all" in request.query) && uid) {
    all = true;

    // Look for any session with the same UID
    const dbAll = util.promisify(session.db.all.bind(session.db));
    const rows = await dbAll(
            "SELECT * FROM session WHERE key='uid' AND value=@UID;",
            {"@UID": JSON.stringify(uid)}
    );
    for (const row of rows)
        await session.run("DELETE FROM session WHERE sid=@SID;", {"@SID": row.sid});
}

await include("../../head.jss", {menu: false, title: "Log out"});
?>

<section class="wrapper special">
    <p>You are now logged out<?JS
    if (all) { write(" on all devices"); }
    ?>.</p>

    <p><a href="/">Return to the home page</a></p>
</section>

<?JS await include("../../tail.jss"); ?>
