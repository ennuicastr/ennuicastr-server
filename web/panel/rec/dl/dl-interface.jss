<?JS!
/*
 * Copyright (c) 2020-2024 Yahweasel
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

const reclib = await include("../lib.jss");

const {rid, recInfo, dlHeader} = arguments[1];

let samplePost = "";
if (!recInfo.purchased)
    samplePost = "&s=1";

function formatToName(format) {
    if (format === "aup")
        return "Audacity project";
    else if (format === "opus")
        return "Opus";
    else if (format === "vorbis")
        return "Ogg Vorbis";
    else if (format === "vtt")
        return "WebVTT captions";
    else
        return format.toUpperCase();
}

// Function to show a download button
function showDL(format) {
    ?><a class="button dl" href="?i=<?JS= recInfo.rid.toString(36) ?>&f=<?JS= format + samplePost ?>" onclick="disableDownloads();"><?JS= formatToName(format) ?></a> <?JS
}

// We say "sample download" if it's a sample download
function maybeSample() {
    if (!recInfo.purchased) {
        ?>
        <a name="sample"></a>
        <header><h2>Sample Download</h2></header>
        <?JS
    } else {
        dlHeader();
    }
}

// Determine their platform
const mac = (/mac os x/i.test(params.HTTP_USER_AGENT));
const mobile = (/(android|iphone|ipad)/i.test(params.HTTP_USER_AGENT));
const recommend = [];
if (!mobile)
    recommend.push("aup");
const recommendBasic = (mac?"aac":"flac");
recommend.push(recommendBasic);

async function showMainDLs() {
    maybeSample();
    ?>

    <p><?JS= reclib.recordingName(recInfo) ?></p>

    <?JS if (recInfo.end) { ?>
    <p>Recording duration: <?JS {
        const start = new Date(recInfo.start);
        const end = new Date(recInfo.end);
        const dur = end.getTime() - start.getTime();
        let m = Math.round(dur / 60000);
        let h = Math.floor(m / 60);
        m -= h * 60;
        if (h) {
            write(`${h} hour`);
            if (h !== 1)
                write("s");
        }
        write(` ${m} minute`);
        if (m !== 1)
            write("s");
    } ?><br/>
    <span style="font-size: 0.8em">
    (NOTE: This duration will be incorrect if you paused during recording)
    </span></p>
    <?JS } ?>

    <p>Please choose a format</p>

    <script type="text/javascript">
    function disableDownloads() {
        document.querySelectorAll(".dl").forEach(function(b) {
            b.classList.add("disabled");
        });
    }
    </script>

    <header><h3>Suggested formats</h3></header>

    <p><span style="display: inline-block; max-width: 50em;">
    <?JS if (!mobile) { ?>
    If you use Audacity (a popular, free audio editor), download the Audacity project. Otherwise, the
    <?JS } else { ?>
    The
    <?JS } ?>
    suggested format for your platform is <?JS= formatToName(recommendBasic) ?>.</span></p>

    <p><?JS
    recommend.forEach(showDL);
    ?></p>

    <p>&nbsp;</p>
    <?JS
}

async function showOtherDLs() {
    ?>
    <header><h3>Other formats</h3></header>

    <p><?JS
    if (mobile)
        showDL("aup");
    ["wav", (mac?"flac":"aac"), "opus", "vorbis"].forEach(showDL);
    ?></p>

    <?JS
    if (recInfo.purchased) {
        ?><p>Raw audio (NOTE: No audio editor will correctly read this file!): <a href="?i=<?JS= recInfo.rid.toString(36) ?>&f=raw">Raw</a></p><?JS
    }
}

module.exports = {showMainDLs, showOtherDLs, showDL};
?>
