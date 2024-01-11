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

import type * as localforageT from "localforage";
declare let localforage : typeof localforageT;
import * as wsp from "web-streams-polyfill/ponyfill";

export class SaveProcessor extends proc.Processor<Uint8Array> {
    constructor(
        /**
         * Prefix to use for saving.
         */
        private _prefix: string,

        /**
         * Input to save and pass through.
         */
        private _input: wsp.ReadableStream<Uint8Array>
    ) {
        super(new wsp.ReadableStream<Uint8Array>({
            pull: async (controller) => {
                if (!this._inputRdr) {
                    const db = this._dbName =
                        _prefix + Math.random() + Math.random() + Math.random();
                    this._inputRdr = _input.getReader();
                    this._ct = 0;
                    this._lfInstance = await localforage.createInstance({
                        name: `ennuicastr-download-processor-${db}`
                    });
                }

                const rd = await this._inputRdr.read();
                if (!rd.done) {
                    controller.enqueue(rd.value);

                    // Save this buffer
                    const idx = this._ct++;
                    await this._lfInstance.setItem("" + idx, rd.value);
                } else {
                    controller.close();
                    this._doneRes();
                }
            }
        }, {highWaterMark: 0}));
        this._donePromise = new Promise<void>(res => this._doneRes = res);
    }

    /**
     * Clear local storage used. Call this after all restorations have been
     * performed.
     */
    public clear() {
        this._lfInstance.dropInstance({
            name: `ennuicastr-download-processor-${this._dbName}`
        });
    }

    public getCt() { return this._ct; }
    public getLFInstance() { return this._lfInstance; }
    public getDonePromise() { return this._donePromise; }

    private _inputRdr: wsp.ReadableStreamDefaultReader<Uint8Array>;
    private _ct: number;
    private _lfInstance: typeof localforage;
    private _dbName: string;
    private _donePromise: Promise<void>;
    private _doneRes: () => unknown;
}

export class RestoreProcessor extends proc.Processor<Uint8Array> {
    constructor(private _save: SaveProcessor) {
        super(new wsp.ReadableStream({
            pull: async (controller) => {
                await _save.getDonePromise();

                if (!this._idx) {
                    this._idx = 0;
                    this._lfInstance = _save.getLFInstance();
                }

                const idx = this._idx++;
                if (idx >= _save.getCt()) {
                    controller.close();
                } else {
                    controller.enqueue(await this._lfInstance.getItem(
                        "" + idx
                    ));
                }
            }
        }, {highWaterMark: 0}));
    }

    private _idx: number;
    private _lfInstance: typeof localforage;
}
