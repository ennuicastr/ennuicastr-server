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

import type * as LibAVT from "libav.js";
import type * as LibSpecBleachT from "@ennuicastr/libspecbleach.js";
declare let LibSpecBleach: LibSpecBleachT.LibSpecBleachWrapper;
import * as wsp from "web-streams-polyfill/ponyfill";

export class NoiserProcessor extends proc.Processor<LibAVT.Frame[]> {
    constructor(private _input: proc.Processor<LibAVT.Frame[]>) {
        super(new wsp.ReadableStream<LibAVT.Frame[]>({
            pull: async (controller) => {
                if (!this._inputRdr)
                    this._inputRdr = _input.stream.getReader();

                const rd = await this._inputRdr.read();
                if (rd.done) {
                    for (const lsp of this._lsp)
                        lsp.free();
                    controller.close();
                    return;
                }

                for (const frame of rd.value) {
                    // Initialize the denoiser
                    if (!this._lsp.length ||
                        this._lsp.length !== frame.data.length ||
                        this._lsp[0].sample_rate !== frame.sample_rate ||
                        this._lsp[0].input_buffer.length !== frame.data[0].length) {
                        for (const lsp of this._lsp)
                            lsp.free();
                        if (!this._lspm)
                            this._lspm = await LibSpecBleach.LibSpecBleach();
                        this._lsp = [];
                        while (this._lsp.length < frame.data.length) {
                            this._lsp.push(new this._lspm.SpecBleach({
                                adaptive: true,
                                block_size: frame.data[0].length,
                                sample_rate: frame.sample_rate,
                                reduction_amount: 20,
                                whitening_factor: 50
                            }));
                        }
                    }

                    // And denoise
                    let lastBreak = performance.now();
                    for (let c = 0; c < frame.data.length; c++) {
                        frame.data[c] = this._lsp[c].process(frame.data[c]);

                        const now = performance.now();
                        if (now > lastBreak + 2) {
                            lastBreak = now;
                            await new Promise(res => setImmediate(res));
                        }
                    }
                }

                controller.enqueue(rd.value);
            }
        }));
    }

    private _inputRdr: wsp.ReadableStreamDefaultReader<LibAVT.Frame[]>;
    private _lspm: LibSpecBleachT.LibSpecBleach;
    private _lsp: LibSpecBleachT.LibSpecBleachOO[] = [];
}
