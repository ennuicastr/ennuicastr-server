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

import * as proc from "./processor";

import * as wsp from "web-streams-polyfill/ponyfill";

const chunkSize = 4194304;

/**
 * A fetch processor. This is a small frontend to fetch() that's careful not to
 * open the stream until you've started reading.
 */
export class FetchProcessor extends proc.CorkableProcessor<Uint8Array> {
    /**
     * @param _url  URL to download
     * @param _init  Initialization for fetch (RequestInit)
     */
    constructor(private _url: string, private _init?: any) {
        super(new wsp.ReadableStream({
            pull: async (controller) => {
                await this.cork;

                if (!this._fetchRdr) {
                    const f = await fetch(_url, _init);
                    this._fetchRdr = f.body.getReader();
                }
                const rd = await this._fetchRdr.read();
                if (rd.done) {
                    controller.close();
                    return;
                }

                if (rd.value.length < chunkSize) {
                    controller.enqueue(rd.value);
                    return;
                }

                // Chunk into reasonable sizes
                for (let i = 0; i < rd.value.length; i += chunkSize) {
                    controller.enqueue(rd.value.slice(i, i + chunkSize));
                    await new Promise(res => setImmediate(res));
                }
            }
        }));
    }

    private _fetchRdr: ReadableStreamDefaultReader<Uint8Array>;
}
