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

import * as archive from "./archive";

import * as wsp from "web-streams-polyfill/ponyfill";

const aupHead = `<?xml version="1.0" standalone="no" ?>
<!DOCTYPE project PUBLIC "-//audacityproject-1.3.0//DTD//EN" "http://audacity.sourceforge.net/xml/audacityproject-1.3.0.dtd" >
<project xmlns="http://audacity.sourceforge.net/xml/" projname="@PROJNAME@" version="1.3.0" audacityversion="2.2.2" rate="48000.0">
\t<tags/>
`;

export function aupProject(name: string, files: archive.Archive) {
    const parts: string[] = [];

    // Start with the header
    parts.push(aupHead.replace("@PROJNAME@", name));

    // Then all the files (which must be .flac)
    for (const file of files) {
        if (!/\.flac$/.test(file.pathname))
            continue;

        const baseName = file.pathname.replace(/\.flac$/, "");
        file.pathname = `${name}_data/${baseName}.ogg`;

        // Add it to the project file
        parts.push(`\t<import filename="${file.pathname}" offset="0.00000000" mute="0" solo="0" height="150" minimized="0" gain="1.0" pan="0.0" />\n`);
    }

    // Trailer
    parts.push("</project>\n");

    const te = new TextEncoder();
    files.push({
        pathname: `${name}.aup`,
        stream: new wsp.ReadableStream<Uint8Array>({
            pull: (controller) => {
                if (parts.length)
                    controller.enqueue(te.encode(parts.shift()));
                else
                    controller.close();
            }
        })
    });
}
