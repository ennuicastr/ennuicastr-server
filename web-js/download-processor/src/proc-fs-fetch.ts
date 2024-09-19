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

export interface VideoDescription {
    /**
     * A unique ID.
     */
    id: string;

    /**
     * File name.
     */
    name: string;

    /**
     * Context in which to request this file.
     */
    ctx: string;

    /**
     * Track number this file belongs to.
     */
    track: number;

    /**
     * Key required to get this data.
     */
    key: string;

    /**
     * Length of each block. Sum is the length of the file.
     */
    len: number[];

    /**
     * MIME type.
     */
    mimeType: string;
}

/**
 * A processor for our MessagePort FS interface that's careful not to open the
 * stream until you've started reading.
 */
export class FSFetchProcessor extends proc.CorkableProcessor<Uint8Array> {
    /**
     * @param _port  Communication port
     * @param _file  Info on the file to fetch
     */
    constructor(private _port: MessagePort, private _file: VideoDescription) {
        super(new wsp.ReadableStream({
            pull: async (controller) => {
                await this.cork;

                if (!this._fetchRdr) {
                    const fmc = new MessageChannel();
                    const fmp = fmc.port1;
                    console.log(this._file);
                    console.log(this._port);
                    const strp = new Promise<ReadableStream<Uint8Array>>(res => {
                        fmp.onmessage = ev => {
                            if (ev.data && ev.data.c === "stream")
                                res(ev.data.stream.stream);
                        };
                    });
                    this._port.postMessage({
                        c: "stream",
                        ctx: this._file.ctx,
                        id: this._file.id,
                        key: this._file.key,
                        port: fmc.port2
                    }, [fmc.port2]);
                    this._fetchRdr = (await strp).getReader();
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
